// Imports
var fs = require('fs');
var path = require('path');
var https = require('https');
var spawn = require('child_process').spawn
var readline = require('readline');

// Variables
var projectPath = path.resolve(process.cwd(), process.argv[2] || "./");
var username = process.env.CIRCLE_USERNAME || "target-tests";
var yottaCommand = "run -e MBED_USER_ID=" + username + " -v " + projectPath + ":/ytProject -w /ytProject --entrypoint yotta mbed/yotta";

var queryHost = "registry.yottabuild.org";
var queryPath = "keyword[]=mbed-official&query=gcc";
var querySize = 30;

var resultsFolder = "./results";
var resultsTemplate = resultsFolder + "/{target}.json";
var resultLines = 10;

var postHost = "www.mbed.com";
var postPath = "/api/v1/tests/yotta/test_results/";
var testType = "https://www.mbed.com/api/v1/tests/yotta/test_types/blinky_build/";
var authToken = process.env.MBED_API_TOKEN;

var targets = [];

function getTargets(completeFn, offset) {
	offset = offset || 0;

	var queryOptions = {
		host: queryHost,
		path: "/search?" + queryPath + "&limit=" + querySize + "&skip=" + offset
	};

	targetQuery(queryOptions, json => {
		if (json.length === 0) completeFn();
		else {
			json = json.filter(module => {
				return (module.type === "target");
			});

			json = json.map(module => {
				return module.name;
			});

			targets = targets.concat(json);
			getTargets(completeFn, offset += querySize);
		}
	});
}

function targetQuery(options, completeFn) {
	https.request(options, res => {
		var retval = "";

		res.on('data', chunk => {
			retval += chunk;
		});

		res.on('end', () => {
			var json = JSON.parse(retval);
			completeFn(json);
		});
	}).end();
}

function buildTarget(target) {
	return new Promise(resolve => {
		console.log("processing: " + target);
		var deps = null;

		function complete(passed, deps, debug) {
			var result = {
				target: target,
				passed: passed
			};

			if (deps) result.deps = deps;
			if (debug) result.debug = debug;

			saveResults(target, result);
			postResults(target, result, function() {
				console.log("target " + target + " " + (passed ? "passed" : "failed"));
				resolve();
			});
		}

		yottaExec("target " + target)
		.then(() => {
			return yottaExec("list --json", true);
		})
		.then(jsonLines => {
			deps = JSON.parse(jsonLines.join(""));
			return yottaExec("clean");
		})
		.then(() => {
			return yottaExec("build");
		})
		.then(() => {
			complete(true, deps);
		})
		.catch(lines => {
			complete(false, deps, lines.join("\n"));
		});
	});
}

function yottaExec(command, allLines) {
	return new Promise((resolve, reject) => {
		var args = yottaCommand.split(" ");
		args = args.concat(command.split(" "));

		var yt = spawn("docker", args);
		var lines = [];

		yt.stdout.on('data', data => {
			console.log(data.toString());
		});

		yt.stderr.on('data', data => {
			console.log(data.toString());
		});

		yt.on("close", code => {
			if (code === 0) {
				resolve(lines);
			} else {
				reject(lines);
			}
		});

		function onLine(line) {
			lines.push(line);
			if (!allLines) {
				while (lines.length > resultLines) lines.shift();
			}
		}

		readline.createInterface({
			input: yt.stdout
		}).on("line", onLine);

		readline.createInterface({
			input: yt.stderr
		}).on("line", onLine);
	});
}

function removeFolder(folder) {
	if (fs.existsSync(folder)) {

		try {
			var files = fs.readdirSync(folder);
			if (files.length > 0) {
				for (var i = 0; i < files.length; i++) {
					fs.unlinkSync(folder + '/' + files[i]);
				}
			}
		} catch(e) {}

		fs.rmdirSync(folder);
	}
}

function saveResults(target, result) {
	var resultsFile = resultsTemplate.replace("{target}", target);
	fs.writeFileSync(resultsFile, JSON.stringify(result));
}

function postResults(target, result, completeFn) {
	if (!authToken) {
		console.log("no token found for posting");
		return completeFn();
	}

	var postData = JSON.stringify({
		test_type: testType,
		taxonomy_id: target,
		result: result.passed
	});

	var postOptions = {
		host: postHost,
		path: postPath,
		method: "POST",
		headers: {
			"Authorization": "Token " + authToken,
			"Content-Type": "application/json",
			"Content-Length": Buffer.byteLength(postData)
		}
	};

	var request = https.request(postOptions, res => {
		console.log("post status: ", res.statusCode);
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			console.log('Response: ' + chunk);
		});
		res.on('end', completeFn);
	});

	console.log("posting", postData);

	request.write(postData);
	request.end();
}

getTargets(() => {
	console.log("found " + targets.length + " targets matching '" + queryPath + "'");

	removeFolder(resultsFolder);
	fs.mkdirSync(resultsFolder);

	// Recurse targets using promises
	targets.reduce((sequence, target) => {
		return sequence.then(() => {
			return buildTarget(target);
		});
	}, Promise.resolve())
	.then(() => {
		process.exit();
	});
});
