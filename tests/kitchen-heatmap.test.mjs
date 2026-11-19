import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountingTime,
  heatLevel,
  linkedHeatmapMode,
  linkedHeatmapSelection,
  loadKitchenHeatmap,
  moneyText,
  sumKopecks,
  preparationKey,
  preparationMinutes,
  stationPlanning,
  validateHeatmapPeriod,
} from "../src/kitchenHeatmap.ts";

const selection = {
  department_id: "venue",
  date_from: "2024-02-26",
  date_to: "2024-03-12",
};
const hourly = (...values) => [...values, ...Array(24 - values.length).fill(0)];
const station = (id, name, hours, revenue, first) => ({
  id,
  name,
  hours,
  revenue_kopecks: revenue,
  first_print_minutes: first,
});
const response = (period, stations = [], metadata = {}) => ({
  ...period,
  sent_to_kitchen: {
    stations,
    unassigned_portions: 1.5,
    unprinted_portions: 2,
    unassigned_revenue_kopecks: -20,
    revenue_complete: true,
    ...metadata,
  },
});
const load = (
  fetchChunk,
  signal = new AbortController().signal,
  progress = () => {},
) => loadKitchenHeatmap(selection, fetchChunk, signal, progress);

test("validates inclusive dates and only presets authorized deep links", () => {
  const departments = [{ id: "venue" }, { id: "other" }];
  const query = new URLSearchParams(selection).toString();
  assert.deepEqual(
    linkedHeatmapSelection(query, departments, "2024-03-12"),
    selection,
  );
  for (const search of [
    query.replace("venue", "denied"),
    query.replace(selection.date_from, "2024-02-30"),
    query.replace(selection.date_to, "2024-03-13"),
    query.replace(selection.date_to, "2024-02-25"),
    query.replace("&date_to=2024-03-12", ""),
    query + "&department_id=other",
    query + "&date_from=2024-02-26",
    query + "&date_to=2024-03-12",
  ])
    assert.equal(
      linkedHeatmapSelection(search, departments, "2024-03-12"),
      null,
    );
  assert.equal(validateHeatmapPeriod("2024-02-29", "2024-02-29"), "");
  assert.equal(validateHeatmapPeriod("1999-01-01", "1999-01-01"), "");
  for (const mode of ["", "ready", "sent", "invalid", "money&mode=money"])
    assert.equal(linkedHeatmapMode("mode=" + mode), "portions");
  assert.equal(linkedHeatmapMode("mode=money"), "money");
});

test("merges signed money, fractional portions and distinct station IDs in seven-day chunks", async () => {
  const intervals = [];
  const progress = [];
  const controller = new AbortController();
  const report = await load(
    async (period, signal) => {
      assert.equal(signal, controller.signal);
      const part = intervals.length;
      intervals.push([period.date_from, period.date_to]);
      return response(period, [
        station("1", part ? "1" : "Цех", hourly(1.5, 1.5), hourly(120, -250), {
          [period.date_from]: [1390, 1451, 1485][part],
        }),
        ...(part === 0
          ? [
              station("2", "Цех", hourly(0, 5), hourly(0, -50), {
                [period.date_to]: -30,
              }),
            ]
          : []),
      ]);
    },
    controller.signal,
    (...values) => progress.push(values),
  );
  assert.deepEqual(intervals, [
    ["2024-02-26", "2024-03-03"],
    ["2024-03-04", "2024-03-10"],
    ["2024-03-11", "2024-03-12"],
  ]);
  assert.deepEqual(progress, [
    [0, 3],
    [1, 3],
    [2, 3],
    [3, 3],
  ]);
  const result = report.sent_to_kitchen;
  assert.deepEqual(
    result.stations.map(({ peak_hours, ...fields }) => fields),
    [
      station("1", "Цех", hourly(4.5, 4.5), hourly(360, -750), {
        "2024-02-26": 1390,
        "2024-03-04": 1451,
        "2024-03-11": 1485,
      }),
      station("2", "Цех", hourly(0, 5), hourly(0, -50), { "2024-03-03": -30 }),
    ],
  );
  assert.equal(result.unassigned_revenue_kopecks, -60);
  assert.equal(result.unassigned_portions, 4.5);
  assert.equal(result.unprinted_portions, 6);
  assert.deepEqual(stationPlanning(result.stations[0]), {
    first: 1451,
    activeDays: 3,
    peak: 4.5,
    peakHours: [0, 1],
  });
});

test("drops all monetary values if any chunk is old, malformed, incomplete or unsafe to add", async () => {
  for (const invalid of [
    undefined,
    [1],
    hourly(0, Number.NaN),
    hourly(0, 1.25),
    hourly(Number.MAX_SAFE_INTEGER),
  ]) {
    const result = await load(async (period) =>
      response(period, [
        station(
          "a",
          "Цех",
          hourly(1),
          period.date_from === "2024-03-04" ? invalid : hourly(100),
          { [period.date_to]: 500 },
        ),
      ]),
    );
    assert.equal(result.sent_to_kitchen.revenue_complete, false);
    assert.equal(result.sent_to_kitchen.unassigned_revenue_kopecks, undefined);
    assert.equal(result.sent_to_kitchen.stations[0].revenue_kopecks, undefined);
    assert.equal(result.sent_to_kitchen.stations[0].hours[0], 3);
  }
  const incomplete = await load(async (period) =>
    response(period, [], { revenue_complete: false }),
  );
  assert.equal(incomplete.sent_to_kitchen.revenue_complete, false);
  const zero = await load(async (period) =>
    response(period, [], { unassigned_revenue_kopecks: 0 }),
  );
  assert.equal(zero.sent_to_kitchen.revenue_complete, true);
  assert.equal(zero.sent_to_kitchen.unassigned_revenue_kopecks, 0);
});

test("drops first-print data if any station has missing or invalid days", async () => {
  for (const firstPrint of [
    undefined,
    {},
    { "2024-02-30": 0 },
    { "2024-03-12": 0 },
    { "2024-02-26": 12.5 },
  ]) {
    const result = await load(async (period) =>
      response(period, [
        station("one", "Цех", hourly(2), hourly(0), firstPrint),
      ]),
    );
    assert.equal(result.sent_to_kitchen.first_print_complete, false);
    assert.equal(
      result.sent_to_kitchen.stations[0].first_print_minutes,
      undefined,
    );
    assert.deepEqual(
      stationPlanning(result.sent_to_kitchen.stations[0]).peakHours,
      [0],
    );
  }
});

test("rejects a partial print dataset or failed chunk without continuing or showing the earlier chunks", async () => {
  for (const failure of [
    (period) => ({ ...period }),
    (period) => response({ ...period, department_id: "wrong" }),
    (period) => response(period, [station("a", "Цех", hourly(-1))]),
    (period) =>
      response(period, [
        station("a", "Цех", hourly(0)),
        station("a", "Цех", hourly(0)),
      ]),
    () => {
      throw Error("connection");
    },
  ]) {
    let calls = 0;
    await assert.rejects(
      load(async (period) =>
        ++calls === 2 ? failure(period) : response(period),
      ),
      /Получен неполный|connection/,
    );
    assert.equal(calls, 2);
  }
});

test("cancels even if an in-flight response arrives", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    load(async (period) => {
      calls++;
      controller.abort();
      return response(period);
    }, controller.signal),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
});

test("formats midnight offsets, exact even medians and valid preparation minutes", () => {
  const plan = stationPlanning(
    station("a", "Цех", hourly(0, 12), hourly(0, 1), {
      "2024-01-01": 1420,
      "2024-01-02": 1461,
    }),
  );
  assert.equal(plan.first, 1440.5);
  assert.equal(accountingTime(plan.first), "00:00:30 (след. день)");
  assert.equal(accountingTime(plan.first - 90), "22:30:30");
  assert.equal(accountingTime(-30), "23:30 (накануне)");
  assert.equal(accountingTime(0), "00:00");
  assert.equal(preparationMinutes("0"), 0);
  assert.equal(preparationMinutes("1440"), 1440);
  for (const invalid of ["", "1.5", "-1", "+1", " 1", "1e3", "1441"])
    assert.equal(preparationMinutes(invalid), undefined);
  assert.equal(
    new Set([
      preparationKey("1", "A", "X"),
      preparationKey("2", "A", "X"),
      preparationKey("1", "B", "X"),
      preparationKey("1", "A", "Y"),
    ]).size,
    4,
  );
  assert.deepEqual(
    [0, 25, -50, 100].map((value) => heatLevel(value, 100)),
    [0, 1, 2, 4],
  );
});

test("preserves a fractional peak tie over 100 weeks and distinguishes unequal exact amounts", async () => {
  const start = Date.UTC(2023, 0, 1);
  const dateTo = new Date(start + 699 * 86400000).toISOString().slice(0, 10);
  let chunks = 0;
  const result = await loadKitchenHeatmap(
    { ...selection, date_from: "2023-01-01", date_to: dateTo },
    async (period) => {
      const once = chunks++ === 0;
      return response(
        period,
        [
          station("a", "Цех", hourly(0.1, once ? 10 : 0), hourly(), {
            [period.date_from]: 0,
          }),
          station(
            "b",
            "Цех",
            hourly(once ? 1e25 : 0, once ? 1e25 : 1e-300),
            hourly(),
            { [period.date_from]: 0 },
          ),
        ],
        { unassigned_portions: 0.1, unprinted_portions: 0.1 },
      );
    },
    new AbortController().signal,
    () => {},
  );
  assert.equal(chunks, 100);
  assert.equal(result.sent_to_kitchen.unassigned_portions, 10);
  assert.equal(result.sent_to_kitchen.unprinted_portions, 10);
  const [a, b] = result.sent_to_kitchen.stations;
  assert.deepEqual(stationPlanning(a).peakHours, [0, 1]);
  assert.deepEqual(a.hours.slice(0, 2), [10, 10]);
  assert.deepEqual(stationPlanning(b).peakHours, [1]);
  assert.deepEqual(b.hours.slice(0, 2), [1e25, 1e25]);
});

test("accepts large signed money when all final displayed dimensions are safe", async () => {
  const max = Number.MAX_SAFE_INTEGER;
  let part = 0;
  const report = await load(async (period) => {
    const temporaryOverflow = [max, 2, -max][part++];
    return response(
      period,
      [
        station(
          "a",
          "Цех",
          hourly(0),
          hourly(
            temporaryOverflow,
            part === 1 ? max : 0,
            part === 1 ? -max : 0,
          ),
          {},
        ),
        station(
          "b",
          "Цех",
          hourly(0),
          hourly(0, part === 1 ? -max : 0, part === 1 ? max : 0),
          {},
        ),
      ],
      { unassigned_revenue_kopecks: temporaryOverflow },
    );
  });
  const sent = report.sent_to_kitchen;
  assert.equal(sent.revenue_complete, true);
  assert.equal(sent.unassigned_revenue_kopecks, 2);
  assert.deepEqual(sent.stations[0].revenue_kopecks.slice(0, 3), [
    2,
    max,
    -max,
  ]);
  assert.equal(sumKopecks([2, max, -max]), 2);
  assert.equal(moneyText(-900719925474099), "−9 007 199 254 740,99 ₽");
  assert.equal(moneyText(max), "90 071 992 547 409,91 ₽");
});

test("rejects monetary values when a displayed row, hour or grand total exceeds safe integer range", async () => {
  const max = Number.MAX_SAFE_INTEGER;
  for (const amounts of [[[max, 1]], [[max], [1]], [[max], [0, 1]]]) {
    let first = true;
    const report = await load(async (period) => {
      const stations = first
        ? amounts.map((values, index) =>
            station(String(index), "Цех", hourly(), hourly(...values), {}),
          )
        : [];
      first = false;
      return response(period, stations, { unassigned_revenue_kopecks: 0 });
    });
    assert.equal(report.sent_to_kitchen.revenue_complete, false);
    assert.ok(
      report.sent_to_kitchen.stations.every(
        (item) => item.revenue_kopecks === undefined,
      ),
    );
  }
});

test("unprinted-only chunks do not suppress printed money elsewhere in the range", async () => {
  const printed = station("a", "Цех", hourly(4), hourly(1234), {
    [selection.date_from]: 0,
  });
  const renderData = ({ sent_to_kitchen: sent }) => [
    sent.revenue_complete,
    sent.all_active_unprinted,
    sent.unprinted_portions,
    sent.stations[0]?.revenue_kopecks?.[0],
  ];
  const split = await load(async (period) => {
    const hasPrint = period.date_from === selection.date_from;
    return response(period, hasPrint ? [printed] : [], {
      has_active_print: hasPrint,
      unassigned_portions: 0,
      unprinted_portions: 2,
    });
  });
  const grouped = await loadKitchenHeatmap(
    { ...selection, date_to: "2024-03-02" },
    async (period) =>
      response(period, [printed], {
        has_active_print: true,
        unassigned_portions: 0,
        unprinted_portions: 6,
      }),
    new AbortController().signal,
    () => {},
  );
  assert.deepEqual(renderData(split), [true, false, 6, 1234]);
  assert.deepEqual(renderData(grouped), renderData(split));

  const deleted = station("delete", "Возврат", hourly(1), hourly(0), {
    [selection.date_from]: 0,
  });
  const allUnprinted = await load(async (period) =>
    response(
      period,
      period.date_from === selection.date_from ? [deleted] : [],
      {
        has_active_print: false,
        unassigned_portions: 0,
        unprinted_portions: 2,
      },
    ),
  );
  assert.deepEqual(renderData(allUnprinted), [false, true, 6, undefined]);
  const empty = await load(async (period) =>
    response(period, [], {
      has_active_print: false,
      unassigned_portions: 0,
      unprinted_portions: 0,
    }),
  );
  assert.deepEqual(renderData(empty), [true, false, 0, undefined]);
});
