const core = require("@actions/core");
const github = require("@actions/github");
const fs = require("fs");
import { markdownTable } from "markdown-table";

const permissableMetrics = [
  "iterations",
  "max",
  "mean",
  "median",
  "min",
  "ops",
  "outliers",
  "rounds",
  "stddev",
];
const permissableTimeUnits = [
  "seconds",
  "miliseconds",
  "microseconds",
  "auto",
];

class Benchmark {
  iterations: number;
  max: number;
  mean: number;
  median: number;
  min: number;
  ops: number;
  outliers: string;
  rounds: number;
  stddev: number;
  total: number;

  constructor(benchmark: any) {
    const stats = benchmark["stats"];
    this.iterations = stats["iterations"];
    this.max = stats["max"];
    this.mean = stats["mean"];
    this.median = stats["mean"];
    this.min = stats["min"];
    this.ops = stats["ops"];
    this.outliers = stats["outliers"];
    this.rounds = stats["rounds"];
    this.stddev = stats["stddev"];
    this.total = status["total"];
  }
}

function readJSON(filename: string): any {
  const rawdata = fs.readFileSync(filename);
  const benchmarkJSON = JSON.parse(rawdata);

  let benchmarks: { [name: string]: Benchmark } = {};
  for (const benchmark of benchmarkJSON["benchmarks"]) {
    benchmarks[benchmark["fullname"]] = new Benchmark(benchmark);
  }

  return benchmarks;
}

function setTimeScale(seconds: number, timeResolution: string): any {
  const timeResolutions = {
    seconds: 1,
    miliseconds: 1000,
    microseconds: 1000000,
  };
  return seconds * timeResolutions[timeResolution];
}

function createMessage(benchmarks: any, oldBenchmarks: any) {
  const oldBenchmarkPresent = oldBenchmarks !== undefined ? true : false;
  const title = "## Result of Benchmark Tests";
  let table: string[][] = [
    [
      "Benchmark",
      "Min",
      "Max",
      "Mean",
      ...(oldBenchmarkPresent ? ["Mean on Repo `HEAD`"] : []),
    ],
  ];

  for (const benchmarkName in benchmarks) {
    const benchmark = benchmarks[benchmarkName];
    table.push([
      benchmarkName,
      benchmark.min,
      benchmark.max,
      benchmark.mean + "+-" + benchmark.stddev,
      ...(oldBenchmarkPresent
        ? [
            oldBenchmarks[benchmarkName].mean +
              "+-" +
              oldBenchmarks[benchmarkName].stddev,
          ]
        : []),
    ]);
  }

  return title + "\n" + markdownTable(table);
}

async function run() {
  if (github.context.eventName !== "pull_request") {
    core.setFailed("Can only run on pull requests!");
    return;
  }

  const githubToken = core.getInput("token");
  const benchmarkFileName = core.getInput("benchmark-file");

  const oldBenchmarkFileName = core.getInput("comparison-benchmark-file");
  // const benchmarkTimeUnit = core.getInput("benchmark-time-unit");
  // const benchmarkMetrics: string[] = core
  //   .getInput("benchmark-metrics")
  //   .split(",")
  //   .filter((x) => x !== "");
  // if (
  //   benchmarkMetrics.filter((x) => !permissableMetrics.includes(x)).length > 0
  // ) {
  //   core.setFailed(
  //     "Invalid metrics requested - valid metrics are: " +
  //       permissableMetrics.join(", ")
  //   );
  //   return;
  // }
  // if (!permissableTimeUnits.includes(benchmarkTimeUnit)) {
  //   core.setFailed(
  //     "Invalid time unit requested - valid time units are: " +
  //       permissableTimeUnits.join(", ")
  //   );
  //   return;
  // }

  const benchmarks = readJSON(benchmarkFileName);
  let oldBenchmarks = undefined;
  if (oldBenchmarkFileName) {
    try {
      oldBenchmarks = readJSON(oldBenchmarkFileName);
    } catch (error) {
      console.log("Can not read comparison file. Continue without it.");
    }
  }
  const message = createMessage(benchmarks, oldBenchmarks);
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
