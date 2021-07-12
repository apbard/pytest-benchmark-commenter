const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");


class Benchmark {
  max: number;
  min: number;
  mean: number;
  stddev: number;
  timeResolutions = {
    seconds: 1,
    miliseconds: 1000,
    microseconds: 1000000,
  }

  setTimeScale(seconds: number, timeResolution: string): any {
    return seconds * this.timeResolutions[timeResolution];
  }

  constructor(benchmark: any, timeUnit: string) {
    const stats = benchmark["stats"];
    this.max = this.setTimeScale(stats["max"], timeUnit).toFixed(2);
    this.min = this.setTimeScale(stats["min"], timeUnit).toFixed(2);
    this.mean = this.setTimeScale(stats["mean"], timeUnit).toFixed(2);
    this.stddev = this.setTimeScale(stats["stddev"], timeUnit).toFixed(2);
  }
}

function readJSON(filename: string, timeUnit: string): any {
  const rawdata = fs.readFileSync(filename);
  const benchmarkJSON = JSON.parse(rawdata);

  let benchmarks: { [name: string]: Benchmark } = {};
  for (const benchmark of benchmarkJSON["benchmarks"]) {
    benchmarks[benchmark["fullname"]] = new Benchmark(benchmark, timeUnit);
  }

  return benchmarks;
}

function createMessage(benchmarks: any, oldBenchmarks: any, timeUnit: string) {
  let message = "## Result of Benchmark Tests\n";

  // Table Title
  message += "| Benchmark ("+ timeUnit+") | Min | Max | Mean |";
  if (oldBenchmarks !== undefined) {
    message += " Mean on Repo `HEAD` |";
  }
  message += "\n";

  // Table Column Definition
  message += "| :--- | :---: | :---: | :---: |";
  if (oldBenchmarks !== undefined) {
    message += " :---: |";
  }
  message += "\n";

  // Table Rows
  for (const benchmarkName in benchmarks) {
    const benchmark = benchmarks[benchmarkName];

    message += `| ${benchmarkName}`;
    message += `| ${benchmark.min}`;
    message += `| ${benchmark.max}`;
    message += `| ${benchmark.mean} `;
    message += `+- ${benchmark.stddev} `;

    if (oldBenchmarks !== undefined) {
      const oldBenchmark = oldBenchmarks[benchmarkName];
      message += `| ${oldBenchmark.mean} `;
      message += `+- ${oldBenchmark.stddev} `;
    }
    message += "|\n";
  }

  return message;
}

async function run() {
  if (github.context.eventName !== "pull_request") {
    core.setFailed("Can only run on pull requests!");
    return;
  }

  const githubToken = core.getInput("token");
  const benchmarkFileName = core.getInput("benchmark-file");
  const benchmarkTimeUnit = core.getInput("benchmark-time-unit");
  const oldBenchmarkFileName = core.getInput("comparison-benchmark-file");

  const benchmarks = readJSON(benchmarkFileName, benchmarkTimeUnit);
  let oldBenchmarks = undefined;
  if (oldBenchmarkFileName) {
    try {
      oldBenchmarks = readJSON(oldBenchmarkFileName, benchmarkTimeUnit);
    } catch (error) {
      console.log("Can not read comparison file. Continue without it.");
    }
  }
  const message = createMessage(benchmarks, oldBenchmarks, benchmarkTimeUnit);
  console.log(message);

  const context = github.context;
  const pullRequestNumber = context.payload.pull_request.number;

  const octokit = github.getOctokit(githubToken);

  // Now decide if we should issue a new comment or edit an old one
  const { data: comments } = await octokit.issues.listComments({
    ...context.repo,
    issue_number: pullRequestNumber,
  });

  const comment = comments.find((comment) => {
    return (
      comment.user.login === "github-actions[bot]" &&
      comment.body.startsWith("## Result of Benchmark Tests\n")
    );
  });

  if (comment) {
    await octokit.issues.updateComment({
      ...context.repo,
      comment_id: comment.id,
      body: message,
    });
  } else {
    await octokit.issues.createComment({
      ...context.repo,
      issue_number: pullRequestNumber,
      body: message,
    });
  }
}

run().catch((error) => core.setFailed("Workflow failed! " + error.message));
