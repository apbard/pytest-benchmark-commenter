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
const permissableTimeUnits = {
  seconds: {
    unit: "s",
    factor: 1,
  },
  milliseconds: { unit: "ms", factor: 1000 },
  microseconds: {
    unit: "us",
    factor: 1000000,
  },
};

class Benchmark {
  iterations: number;
  max: string;
  mean: string;
  median: string;
  min: string;
  ops: string;
  rounds: number;
  stddev: string;

  timeUnitNormalisation (metric: number, timeFactor: string): string {
    const localFactor = permissableTimeUnits[timeFactor]
    return (metric * localFactor.factor).toFixed(2) + " " + localFactor.unit;
  }

  constructor(benchmark: any, timeFactor: string) {
    const stats = benchmark["stats"];
    this.iterations = stats["iterations"];
    this.max = this.timeUnitNormalisation(stats["max"], timeFactor);
    this.mean = this.timeUnitNormalisation(stats["mean"], timeFactor);
    this.median = this.timeUnitNormalisation(stats["median"], timeFactor);
    this.min = this.timeUnitNormalisation(stats["min"], timeFactor);
    this.ops = stats["ops"].toFixed(4);
    this.rounds = stats["rounds"];
    this.stddev = this.timeUnitNormalisation(stats["stddev"], timeFactor);
  }
}

function readJSON(filename: string, timeUnit: string, benchmarkName: string): any {
  const rawdata = fs.readFileSync(filename);
  const benchmarkJSON = JSON.parse(rawdata);

  let benchmarks: { [name: string]: Benchmark } = {};
  for (const benchmark of benchmarkJSON["benchmarks"]) {
    benchmarks[benchmark[benchmarkName]] = new Benchmark(benchmark, timeUnit);
  }

  return benchmarks;
}

function createMessage(
  benchmarks: any,
  oldBenchmarks: any,
  metrics: Array<string>,
  compareMetric: string) {
  const title = "## Result of Benchmark Tests";
  let table: string[][] = [];

  // Header building
  let headers = ["Benchmark", ...metrics];
  if (oldBenchmarks !== undefined) {
    headers.push(...[compareMetric + " on Repo `HEAD`", "change"]);
  }
  table.push(headers);

  // Table Rows per Benchmark
  for (const benchmarkName in benchmarks) {
    const benchmark = benchmarks[benchmarkName];
    let row = [benchmarkName];
    

    for (const metric of metrics) {
      row.push(benchmark[metric] );
    }

    if (oldBenchmarks !== undefined) {
      row.push(
        ...[
          oldBenchmarks[benchmarkName][compareMetric],
          (
            (oldBenchmarks[benchmarkName][compareMetric] /
              benchmark[compareMetric]) *
            100
          ).toFixed(2) + "%",
        ]
      );
    }
    table.push(row);
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
  const oldBenchmarkMetric = core.getInput("comparison-benchmark-metric");
  const benchmarkName = core.getInput("benchmark-name");
  const benchmarkTimeUnit = core.getInput("benchmark-time-unit");
  const benchmarkMetrics: string[] = core
    .getInput("benchmark-metrics")
    .split(",")
    .filter((x) => x !== "");

  // Ugly work to try to validate strings as multiple choice answers
  if (
    benchmarkMetrics.filter((x) => !permissableMetrics.includes(x)).length > 0
  ) {
    core.setFailed(
      "Invalid metrics requested " +
        benchmarkMetrics.join(", ") +
        " - valid metrics are: " +
        permissableMetrics.join(", ")
    );
    return;
  }
  if (!permissableMetrics.includes(oldBenchmarkMetric)) {
    core.setFailed(
      "Invalid metrics requested " +
        oldBenchmarkMetric +
        " - valid metrics are: " +
        permissableMetrics.join(", ")
    );
    return;
  }
  if (!Object.keys(permissableTimeUnits).includes(benchmarkTimeUnit)) {
    core.setFailed(
      "Invalid time unit requested - valid time units are: " +
        Object.keys(permissableTimeUnits).join(", ")
    );
    return;
  }
  if (!["name", "fullname"].includes(benchmarkName)) {
    core.setFailed(
      "Invalid benchmark name - valid name choices: name, fullname"
    );
    return;
  }

  const benchmarks = readJSON(benchmarkFileName, benchmarkTimeUnit, benchmarkName);
  let oldBenchmarks = undefined;
  if (oldBenchmarkFileName) {
    try {
      oldBenchmarks = readJSON(oldBenchmarkFileName, benchmarkTimeUnit, benchmarkName);
    } catch (error) {
      console.log("Can not read comparison file. Continue without it.");
    }
  }
  const message = createMessage(
    benchmarks,
    oldBenchmarks,
    benchmarkMetrics,
    oldBenchmarkMetric
  );
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
