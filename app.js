import { extractCore, composeElements } from "./extract.js";
import { contractText } from "./office.js";
import { workbook } from "./xlsx.js";

const $ = (id) => document.getElementById(id);
const state = { core: null, overrides: {}, manual: blankManual() };

function blankManual() {
  return { code: "", perfMode: "single", b1: "", b2: "", r1: "", r2: "", ongoing: false, openDate: "", channel: "house" };
}

$("file").addEventListener("change", (event) => { const file = event.target.files?.[0]; if (file) read(file); });
const drop = $("drop");
drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("dragging"); });
drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("dragging");
  const file = event.dataTransfer.files?.[0];
  if (file) read(file);
});

for (const id of ["code", "b1", "r1", "t1", "p1", "t2", "p2", "open-date"]) $(id).addEventListener("input", syncManual);
$("ongoing").addEventListener("change", syncManual);
for (const input of document.querySelectorAll('input[name="perf"],input[name="channel"]')) input.addEventListener("change", syncManual);

$("download").addEventListener("click", download);
$("copy").addEventListener("click", copyTable);

async function read(file) {
  $("read-error").hidden = true;
  $("file-name").hidden = false;
  $("file-name").textContent = `正在读取 ${file.name}`;
  try {
    const text = await contractText(file);
    state.core = extractCore(text);
    state.overrides = {};
    state.manual = manualFrom(state.core);
    state.fileName = file.name.replace(/\.(docx|doc)$/i, "");
    paintManual();
    paintTable();
    $("file-name").textContent = file.name;
    $("manual").hidden = false;
    $("result").hidden = false;
  } catch (error) {
    $("file-name").hidden = true;
    $("read-error").hidden = false;
    $("read-error").textContent = error.message || "这份合同没有读出来。";
  }
}

function manualFrom(core) {
  const perf = core.performance || {};
  const manual = blankManual();
  if (perf.mode === "none") manual.perfMode = "none";
  else if (perf.mode === "tier") {
    manual.perfMode = "tier";
    manual.r1 = perf.r1 || "";
    manual.r2 = perf.r2 || "";
  } else {
    manual.perfMode = "single";
    manual.b1 = perf.benchmark || "";
    manual.r1 = perf.ratio || "";
  }
  return manual;
}

function paintManual() {
  $("code").value = state.manual.code;
  document.querySelector(`input[name="perf"][value="${state.manual.perfMode}"]`).checked = true;
  document.querySelector(`input[name="channel"][value="${state.manual.channel}"]`).checked = true;
  $("b1").value = state.manual.b1;
  $("r1").value = state.manual.r1;
  $("t1").value = state.manual.b1;
  $("p1").value = state.manual.r1;
  $("t2").value = state.manual.b2;
  $("p2").value = state.manual.r2;
  $("ongoing").checked = state.manual.ongoing;
  $("open-date").value = state.manual.openDate;
  $("open-date").hidden = !state.manual.ongoing;
  $("perf-single").hidden = state.manual.perfMode !== "single";
  $("perf-tier").hidden = state.manual.perfMode !== "tier";
  const perf = state.core.performance || {};
  $("perf-hint").textContent = perf.mode === "none"
    ? "合同写明管理人不提取业绩报酬。若公告另有约定，可改成单一基准或阶梯计提。"
    : perf.mode === "tier"
      ? "合同有两档提取比例，没有写两档基准数字。基准留空时，要素表会提示以公告为准。"
      : perf.benchmark
        ? "合同里已经写了计提基准，可直接用，也可以改成公告上的新基准。"
        : "合同只写了提取比例，基准指向公告。填上基准后会写进要素表；不填则保留「以管理人公告为准」。";
  const notes = $("notes");
  notes.hidden = !state.core.notes.length;
  notes.replaceChildren(...state.core.notes.map((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    return item;
  }));
}

function syncManual() {
  const mode = document.querySelector('input[name="perf"]:checked').value;
  const ongoing = $("ongoing").checked;
  const modeChanged = mode !== state.manual.perfMode || ongoing !== state.manual.ongoing;
  state.manual = {
    code: $("code").value.trim(),
    perfMode: mode,
    b1: mode === "tier" ? $("t1").value.trim() : $("b1").value.trim(),
    r1: mode === "tier" ? $("p1").value.trim() : $("r1").value.trim(),
    b2: $("t2").value.trim(),
    r2: $("p2").value.trim(),
    ongoing,
    openDate: $("open-date").value.trim(),
    channel: document.querySelector('input[name="channel"]:checked').value,
  };
  delete state.overrides["产品名称"];
  delete state.overrides["开放期"];
  delete state.overrides["业绩报酬"];
  delete state.overrides["产品风险等级"];
  if (modeChanged) paintManual();
  paintTable();
}

function rows() {
  return composeElements(state.core, state.manual).map(([label, value]) => [label, state.overrides[label] ?? value]);
}

function paintTable() {
  const root = $("table");
  root.replaceChildren();
  for (const [label, value] of rows()) {
    const name = document.createElement("label");
    name.textContent = label;
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("aria-label", label);
    input.addEventListener("input", () => { state.overrides[label] = input.value; });
    root.append(name, input);
  }
}

function download() {
  const data = rows();
  const blob = new Blob([workbook(data)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  const title = (data[0][1] || state.fileName || "产品要素表").replace(/[\\/:*?"<>|]/g, "");
  link.href = URL.createObjectURL(blob);
  link.download = `${title}-产品要素表.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function copyTable() {
  const text = rows().map(([label, value]) => `${label}\n${value}`).join("\n\n");
  await navigator.clipboard.writeText(text);
  $("copied").hidden = false;
  setTimeout(() => { $("copied").hidden = true; }, 1600);
}
