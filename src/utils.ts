const core = require("@actions/core");
import { markdownTable } from "markdown-table";

function titleCase(str) {
  return str.replace(/\w\S*/g, function (txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

export function createMessage(
  benchmarks: any,
  oldBenchmarks: any,
  metrics: Array<string>,
  compareMetric: string,
  comparisonHigherIsBetter: boolean,
  comparisonThreshold: number,
  benchmarkTitle: string
) {
  let table: string[][] = [];
  let improved_benchmarks = 0;
  let worsened_benchmarks = 0;
  let total_benchmarks = 0;
  const green = "#35bf28";
  const yellow = "#D29922";
  const red = "#d91a1a";

  // Header building
  let headers = [...metrics.map((metric) => titleCase(metric))];
  if (oldBenchmarks !== undefined) {
    headers.push(...[titleCase(compareMetric) + " on Repo `HEAD`", "Change"]);
  }
  table.push(headers);

  // Table Rows per Benchmark
  for (const benchmarkName in benchmarks) {
    total_benchmarks += 1;

    const benchmark = benchmarks[benchmarkName];
    let row = Array();

    for (const metric of metrics) {
      row.push(benchmark[metric].valueWithUnit);
    }

    if (oldBenchmarks !== undefined) {
      let change =
        ((benchmark[compareMetric].value -
          oldBenchmarks[benchmarkName][compareMetric].value) /
          oldBenchmarks[benchmarkName][compareMetric].value) *
        100;

      let relevant_change = Math.abs(change) > comparisonThreshold;
      let is_improvement = comparisonHigherIsBetter && change > 0;

      improved_benchmarks += Number(is_improvement && relevant_change);
      worsened_benchmarks += Number(!is_improvement && relevant_change);

      let change_str = `${change > 0 ? "+" : ""}${change.toFixed(2)}\\\\%`;
      if (Math.abs(change) >= 0.01) {
        change_str = is_improvement
          ? `\\color{${green}}${change_str}`
          : `\\color{${red}}${change_str}`;
      }

      change_str = relevant_change ? `\\textbf{${change_str}}` : change_str;
      change_str = `\$${change_str}\$`;

      row.push(
        ...[
          oldBenchmarks[benchmarkName][compareMetric].valueWithUnit,
          change_str,
        ]
      );
    }
    table.push(row);
  }

  let status = "";
  let summary = "";

  // if doing the comparison add a summary
  if (oldBenchmarks !== undefined) {
    summary = `### Total Benchmarks: ${total_benchmarks}. `;
    summary += `Improved: $\\large\\color{${green}}${improved_benchmarks}\$. `;
    summary += `Worsened: $\\large\\color{${red}}${worsened_benchmarks}\$.\n`;

    if (worsened_benchmarks == 0) {
      status = `\$\\color{${green}}\\textsf{\\Large\\&#x2714;\\kern{0.2cm}\\normalsize OK}\$`;
    } else if (improved_benchmarks >= 0) {
      status = `\$\\color{${yellow}}\\textsf{\\Large\\&#x26A0;\\kern{0.2cm}\\normalsize Warning}\$`;
    } else {
      status = `\$\\color{${red}}\\textsf{\\Large\\&#x26D4;\\kern{0.2cm}\\normalsize Fail}\$`;
    }
  }

  let title: string = `## ${status} \t ${benchmarkTitle} \n`;
  let details_title = `<summary> Expand to view detailed results </summary>`;
  let details = `<details> ${details_title} \n\n ${markdownTable(
    table
  )} \n </details>`;
  let message = `${title} ${summary} ${details}`;
  return message;
}
export function inputValidate(
  provided: Array<string>,
  permissable: Array<string>,
  inputName: string
): void {
  if (provided.filter((x) => !permissable.includes(x)).length > 0) {
    core.setFailed(
      `Invalid value for ${inputName}: ${provided.join(
        ", "
      )} - valid values for ${inputName} are: ${permissable.join(", ")}`
    );
    return;
  }
}
