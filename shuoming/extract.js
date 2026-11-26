const MANAGER = "上海国泰海通证券资产管理有限公司";
const RISK_WORD = { R1: "低风险", R2: "中低风险", R3: "中风险", R4: "中高风险", R5: "高风险" };

export function guessKind(text) {
  const head = text.slice(0, 2000);
  if (/单一资产管理计划/.test(head) && !/集合资产管理计划/.test(head)) return "单一";
  return "集合";
}

export function extractAll(raw, kind) {
  const text = clean(raw);
  return kind === "单一" ? extractSingle(text) : extractCollective(text);
}

export function fieldOrder(kind) {
  return kind === "单一"
    ? [
        "名称", "产品类型", "管理期限", "投资范围", "投资策略", "投资限制和投资禁止", "投资风险揭示",
        "管理人概况", "托管人概况", "销售机构", "聘用投资顾问情况", "收益分配和风险承担",
        "费用种类", "业绩报酬", "认购费、参与费、退出费", "投资者的重要权利和义务",
        "募集期间", "信息披露的内容、方式和频率", "其他事项（利益冲突情况及其他重要事项）",
      ]
    : [
        "名称", "类型", "目标规模", "管理期限", "募集期", "封闭期", "开放期", "份额面值", "最低金额",
        "相关费率", "投资范围", "投资管理的方法和标准", "投资限制", "风险收益特征", "适合推广对象",
        "管理人", "托管人", "销售机构", "初始募集", "认购的原则",
        "集合计划的参与·办理时间", "参与原则", "参与费",
        "集合计划的退出·办理时间", "退出原则", "退出费",
        "管理人自有资金参与情况", "集合计划的分级", "集合计划成立的条件", "集合计划设立失败",
        "集合计划份额转让", "费用种类", "不列入集合计划费用的项目", "业绩报酬", "收益分配",
        "集合计划展期", "终止", "信息披露的内容、频率和方式", "投资者权利与义务", "风险揭示",
        "利益冲突情况以及可能影响投资者合法权益的其他重要事项",
      ];
}

function extractSingle(text) {
  let basic = chapter(text, ["第五章"], ["第六章", "第七章"]) || sliceBasic(text);
  const basicCut = basic.search(/\n一、因本资管计划|\n一、资产管理计划成立|\n一、参与和退出/);
  if (basicCut > 200) basic = basic.slice(0, basicCut);
  const blocks = numberedBlocks(basic);
  const name = firstLine(block(blocks, "资产管理计划的名称", "名称")) || coverName(text, "单一");
  const typeSrc = block(blocks, "类别", "产品类型");
  let productType = (typeSrc.match(/(固定收益类|混合类|权益类|期货和衍生品类)/) || [])[1] || "";
  if (/基金中基金|FOF/.test(typeSrc) && !/非基金中基金|非FOF/.test(typeSrc) && productType && !/FOF/.test(productType)) {
    productType += "、FOF类";
  }
  const invest = chapter(text, ["第十章"], ["第十一章"]) || "";
  const investBlocks = numberedBlocks(invest);
  let scope = block(investBlocks, "投资范围") || block(blocks, "主要投资方向", "投资方向");
  if (scope.includes("（一）投资范围")) scope = scope.split("（一）投资范围").pop().trim();
  const strategy = block(investBlocks, "投资策略") || block(investBlocks, "投资管理的方法和标准");
  let limits = block(investBlocks, "投资限制");
  const prohibit = block(investBlocks, "投资禁止");
  if (prohibit) limits = [limits, "投资禁止", prohibit].filter(Boolean).join("\n\n");
  const { word, code, suit } = fieldRisk(basic);
  const manager = fieldManager(text);
  const custodian = fieldCustodian(text);
  const sales = salesName(block(blocks, "销售机构", "代销机构", "销售方式") || basic);
  const fees = chapter(text, ["第十九章"], ["第二十章"]) || chapter(text, ["第十六章"], ["第十七章"]) || block(blocks, "费用");
  const feeKinds = splitBefore(fees, "二、") || fees;
  const perf = /不收取业绩报酬|不提取业绩报酬/.test(basic + fees) ? "本计划不收取业绩报酬" : (fees.match(/业绩报酬[\s\S]{0,700}/) || [""])[0];
  const subscribe = subscribeFees(block(blocks, "费用"), fees);
  const rights = investorRights(chapter(text, ["第四章"], ["第五章"]) || "");
  const disclose = chapter(text, ["第二十一章"], ["第二十二章"]) || "";
  const conflict = chapter(text, ["第十二章"], ["第十三章"]) || "";
  const duration = firstLine(block(blocks, "存续期限", "管理期限"));
  const raise = /不设置募集期|不设初始募集期|不设募集期间/.test(basic) ? "本资管计划不设置募集期。" : "本资管计划不设置募集期。";
  const advisorChap = chapter(text, ["第十一章"], ["第十二章"]) || "";
  const advisor = /未聘用投资顾问|不聘请投资顾问|无投资顾问/.test(advisorChap) || !advisorChap
    ? "本单一资产管理计划未聘用投资顾问。"
    : advisorChap.slice(0, 800);
  const riskReveal = "管理人承诺以诚实信用，谨慎勤勉的原则管理和运用资管计划资产，管理人制定并执行相应的内部控制制度和风险管理制度，以降低风险出现的概率。但这些制度和方法不能完全防止风险出现的可能，管理人不保证本计划一定盈利，也不保证最低收益。本计划可能面临的风险包括但不限于本金损失风险、市场风险、流动性风险、管理风险、信用风险、投资标的风险、关联交易风险、操作风险、特定风险及其他风险。具体风险揭示内容详见《风险揭示书》。";
  const fields = {
    名称: name,
    产品类型: productType,
    管理期限: duration,
    投资范围: scope,
    投资策略: strategy,
    投资限制和投资禁止: limits,
    投资风险揭示: riskReveal,
    管理人概况: manager,
    托管人概况: custodian,
    销售机构: sales,
    代销机构: sales,
    聘用投资顾问情况: advisor,
    收益分配和风险承担: "投资者根据《管理合同》的规定参与或退出资管计划，取得受托资产的收益和清算后的剩余资产，包括但不限于投资收益（如有）等；投资者自行承担本资管计划的投资风险。",
    费用种类: feeKinds,
    业绩报酬: perf,
    "认购费、参与费、退出费": subscribe,
    "参与费、退出费": subscribe,
    投资者的重要权利和义务: rights,
    募集期间: raise,
    "信息披露的内容、方式和频率": disclose,
    "其他事项（利益冲突情况及其他重要事项）": conflict,
  };
  return {
    产品简称: name,
    年份: "二〇二六",
    风险等级: word && code ? `${word}（${code}）` : word,
    适合投资者: suit,
    字段: fields,
    notes: missingNotes(fields, ["名称", "投资范围", "托管人概况"]),
  };
}

function extractCollective(text) {
  const basic = sliceBasic(text) || text;
  const name = fieldName(basic, text, "集合");
  const type = inlineOrBlock(basic, /类型[：:]/, /(?:类别|产品类型)/);
  const duration = fieldDuration(basic);
  const opening = fieldOpening(basic);
  const closed = /开放期以外的期间[\s\S]{0,80}封闭期/.test(basic)
    ? (basic.match(/开放期以外的期间[^\n。]{0,80}封闭期[^\n。]{0,40}/) || ["开放期以外的期间，均为本集合计划的封闭期。封闭期内不办理参与、退出业务。"])[0]
    : "开放期以外的期间，均为本集合计划的封闭期。封闭期内不办理参与、退出业务。";
  const raisePeriod = (basic.match(/初始募集期[^\n。]{0,80}/) || ["本集合计划初始募集期自份额发售之日起不超过60个自然日。"])[0];
  const face = "人民币1.00元";
  const minAmt = (text.match(/首次(?:认购|参与)[^\n。]{0,80}(?:不低于|不得低于)[^\n。]{0,40}/) || [""])[0];
  const scope = investmentBlock(basic, /主要投资方向|投资方向[：:]|投资范围/, /投资比例|投资策略|产品风险等级/) || chapter(text, ["投资范围"], ["投资策略", "投资限制"]);
  const strategy = fieldStrategy(text);
  const limits = chapter(text, ["投资限制"], ["投资禁止", "业绩比较基准", "建仓期"]) || "";
  const { word, code, suit } = fieldRisk(basic);
  const manager = fieldManager(text);
  const custodian = fieldCustodian(text);
  const sales = salesName(basic) || "上海国泰海通证券资产管理有限公司（直销）以及中国证监会认可并与管理人签署相关协议的其他销售机构。";
  const fees = fieldFeeBlock(basic);
  const perf = fieldPerformance(basic);
  const disclose = chapter(text, ["信息披露"], ["投资者的权利", "风险揭示", "利益冲突"]) || "";
  const rights = chapter(text, ["投资者的权利", "投资者权利"], ["投资者的义务", "管理人的权利"]) || "";
  const conflict = chapter(text, ["利益冲突"], ["投资经理", "资产管理计划的财产"]) || "";
  const dist = chapter(text, ["收益分配"], ["信息披露", "风险揭示"]) || "";
  const term = chapter(text, ["应当终止", "计划应当终止", "终止与财产清算"], ["违约责任", "争议"]) || "";
  const extend = /可以展期/.test(text) ? (text.match(/[^\n]{0,20}可以展期[^\n]{0,200}/) || ["本集合计划可以展期。"])[0] : "本集合计划可以展期。";
  const own = /自有资金/.test(text) ? (text.match(/管理人以自有资金[^\n。]{0,200}/) || ["管理人以自有资金参与本集合计划"])[0] : "";
  const riskLine = code ? `管理人根据相关法律法规及其内部相关制度规定，将本集合计划的风险评级评价为${word}(${code})。` : "";
  const fit = code
    ? `根据前述风险评级，本集合计划适合向合格投资者中的专业投资者和风险承受能力评估结果为${suitText(code)}的普通投资者销售。但法律法规及销售机构另有规定的除外。`
    : "";
  const fields = {
    名称: name,
    类型: type,
    目标规模: (basic.match(/目标规模[：:][\s\S]{0,300}/) || basic.match(/不设规模上限[^\n。]{0,80}/) || [""])[0],
    管理期限: duration,
    募集期: raisePeriod,
    封闭期: closed,
    开放期: opening,
    份额面值: face,
    最低金额: minAmt,
    相关费率: fees,
    投资范围: scope,
    投资管理的方法和标准: strategy,
    投资限制: limits,
    风险收益特征: riskLine,
    适合推广对象: fit,
    管理人: manager,
    托管人: custodian,
    销售机构: sales,
    初始募集: raisePeriod,
    认购的原则: chapter(text, ["认购的原则"], ["认购的程序", "认购费用"]) || "",
    "集合计划的参与·办理时间": opening,
    参与原则: chapter(text, ["参与原则"], ["参与费", "参与程序"]) || "",
    参与费: (basic.match(/参与费率[^\n。%]{0,20}\d+(?:\.\d+)?%/) || ["本集合计划参与费率为0%。"])[0],
    "集合计划的退出·办理时间": opening,
    退出原则: chapter(text, ["退出原则"], ["退出费", "退出程序"]) || "",
    退出费: (basic.match(/退出费率[^\n。%]{0,20}\d+(?:\.\d+)?%/) || ["退出费率：0%。"])[0],
    管理人自有资金参与情况: own,
    集合计划的分级: /不分级/.test(text) ? "本集合计划不分级。" : (text.match(/本集合计划[^\n]{0,20}分级[^\n]{0,40}/) || ["本集合计划不分级。"])[0],
    集合计划成立的条件: (text.match(/初始募集规模不低于[^\n。]{0,120}/) || [""])[0],
    集合计划设立失败: chapter(text, ["设立失败"], ["份额转让", "费用"]) || "",
    集合计划份额转让: chapter(text, ["份额转让"], ["费用", "收益分配"]) || "",
    费用种类: chapter(text, ["费用种类", "计划费用的种类"], ["不列入", "业绩报酬"]) || "",
    不列入集合计划费用的项目: chapter(text, ["不列入"], ["业绩报酬", "费用计提"]) || "",
    业绩报酬: perf,
    收益分配: dist,
    集合计划展期: extend,
    终止: term,
    "信息披露的内容、频率和方式": disclose,
    投资者权利与义务: rights,
    风险揭示: "管理人承诺以诚实信用，谨慎勤勉的原则管理和运用集合计划资产。具体风险揭示内容详见《风险揭示书》。",
    利益冲突情况以及可能影响投资者合法权益的其他重要事项: conflict,
  };
  const short = name.replace(/集合资产管理计划/g, "").trim();
  return {
    产品简称: short || name,
    年份: "二〇二六",
    风险等级: word && code ? `${word}(${code})` : word,
    适合投资者: suitText(code),
    字段: fields,
    notes: missingNotes(fields, ["名称", "投资范围", "托管人"]),
  };
}

function suitText(code) {
  const n = Number(String(code || "").slice(1));
  if (!n) return "";
  const map = { 1: "谨慎型（C1）", 2: "谨慎型（C2）", 3: "稳健型（C3）", 4: "积极型（C4）", 5: "激进型（C5）" };
  const out = [];
  for (let i = n; i <= 5; i++) out.push(map[i]);
  return out.join("、");
}

function missingNotes(fields, keys) {
  return keys.filter((k) => !fields[k]).map((k) => `未识别「${k}」，请在表里手补。`);
}

function clean(raw) {
  return String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function isToc(line) {
  return /\t\s*\d+\s*$/.test(line) || /HYPERLINK|PAGEREF|_Toc/.test(line);
}

function chapter(text, starts, ends) {
  const lines = text.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (isToc(t)) continue;
    if (starts.some((s) => t.replace(/\s/g, "").startsWith(s.replace(/\s/g, "")))) {
      start = i;
      break;
    }
  }
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim().replace(/\s/g, "");
    if (isToc(lines[i].trim())) continue;
    if (ends.some((s) => t.startsWith(s.replace(/\s/g, "")))) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").replace(/^\n+|\n+$/g, "");
}

function numberedBlocks(text) {
  const parts = ("\n" + text).split(/\n(?=[一二三四五六七八九十]{1,3}、)/);
  const out = {};
  for (const part of parts) {
    const t = part.trim();
    const m = t.match(/^([一二三四五六七八九十]{1,3})、\s*([\s\S]*)$/);
    if (!m) continue;
    const rest = m[2];
    const nl = rest.indexOf("\n");
    const title = (nl < 0 ? rest : rest.slice(0, nl)).trim();
    const body = nl < 0 ? "" : rest.slice(nl + 1).trim();
    out[title] = body;
  }
  return out;
}

function block(blocks, ...needles) {
  for (const [key, val] of Object.entries(blocks || {})) {
    if (needles.some((n) => key.includes(n))) return val;
  }
  return "";
}

function firstLine(text) {
  for (const line of String(text || "").split("\n")) {
    const t = line.trim().replace(/[。.;；]+$/, "");
    if (t) return t;
  }
  return "";
}

function sliceBasic(text) {
  const marks = ["集合计划的基本情况", "资产管理计划的基本情况", "第五章"];
  let best = "";
  for (const mark of marks) {
    let from = 0;
    while (from < text.length) {
      const at = text.indexOf(mark, from);
      if (at < 0) break;
      const before = text.slice(Math.max(0, at - 12), at);
      if (/\t/.test(before) || /HYPERLINK/.test(text.slice(at, at + 40))) {
        from = at + mark.length;
        continue;
      }
      const chunk = text.slice(at, at + 14000);
      const end = chunk.search(/\n(?:第六章|六、资产管理计划的募集|资产管理计划的募集)/);
      const body = (end > 200 ? chunk.slice(0, end) : chunk).trim();
      if (body.length > best.length) best = body;
      from = at + mark.length;
    }
  }
  return best;
}

function coverName(text, kind) {
  const re = kind === "单一" ? /国泰[^\n]{0,40}单一资产管理计划/ : /国泰[^\n]{0,40}集合资产管理计划/;
  const m = text.match(re);
  return m ? m[0].replace(/\s+/g, "") : "";
}

function fieldName(basic, text, kind) {
  const inline = basic.match(/名称[：:]\s*([^\n。]{4,80})/);
  if (inline) return inline[1].replace(/集合资产管理计划.*/, "集合资产管理计划").trim();
  const blockHit = basic.match(/资产管理计划的名称\s*\n+\s*([^\n。]{4,80})/);
  if (blockHit) return blockHit[1].replace(/。$/, "").trim();
  return coverName(text, kind);
}

function inlineOrBlock(basic, inlineRe, blockRe) {
  const inline = basic.match(new RegExp(inlineRe.source + "\\s*([^\\n。]{2,60})"));
  if (inline) return inline[1].trim();
  const blockHit = basic.match(new RegExp(blockRe.source + "\\s*\\n+\\s*([^\\n。]{2,60})"));
  return blockHit ? blockHit[1].trim() : "";
}

function fieldManager(text) {
  const found = text.match(/管理人[：:]\s*([^\n]{4,40})/);
  let name = found ? found[1].trim() : "";
  name = name.replace(/上海国泰君安证券资产管理有限公司/g, MANAGER);
  return name || MANAGER;
}

function fieldCustodian(text) {
  const seal = text.match(/托管人[（(]公章[^）)]*[）)][：:]\s*([^\n]{4,40})/);
  if (seal) return seal[1].replace(/[。；].*$/, "").trim();
  const found = text.match(/(?:集合)?托管人[：:]\s*([^\n]{4,40})/);
  const name = found ? found[1].replace(/[。；].*$/, "").trim() : "";
  return name && !/承诺/.test(name) ? name : "";
}

function salesName(text) {
  const found = String(text || "").match(/销售机构[：:]\s*([^\n。]+)/);
  return found ? found[1].trim() : firstLine(text);
}

function fieldDuration(basic) {
  const m = basic.match(/存续期限(?:为)?\s*(?:自成立之日起)?\s*([0-9０-９一二三四五六七八九十]+\s*(?:年|个月)(?:（可展期）|\(可展期\))?)/);
  if (!m) return firstLine(basic.match(/存续期[^\n]{0,80}/) || [""]);
  const span = m[1].replace(/\s+/g, "");
  return span.startsWith("自") ? span : `自成立之日起${span.replace(/^自成立之日起/, "")}`;
}

function fieldOpening(basic) {
  const numbered = basic.search(/2、开放期[：:]/);
  if (numbered >= 0) {
    let rest = basic.slice(numbered).replace(/^2、开放期[：:]/, "").trim();
    const end = rest.search(/\n(?:[三四五六七八九十]{1,3}、|资产管理计划的目标规模|资产管理计划的存续期限)/);
    if (end > 0) rest = rest.slice(0, end);
    return rest.replace(/\n{2,}/g, "\n").trim();
  }
  const mode = basic.search(/运作方式/);
  if (mode < 0) return "";
  let rest = basic.slice(mode).replace(/^[^\n]*运作方式[：:]?\s*/, "").trim();
  const end = rest.search(/\n[（(][五六七八九十][）)]|\n(?:资产管理计划的投资目标|投资目标、主要投资方向)/);
  if (end > 0) rest = rest.slice(0, end);
  return rest.replace(/\n{2,}/g, "\n").trim();
}

function fieldStrategy(text) {
  const method = text.search(/投资管理的方法和标准/);
  if (method >= 0) {
    let rest = text.slice(method).replace(/^投资管理的方法和标准\s*/, "");
    const end = rest.search(/\n\s*(?:2[、.）)]|[（(][四五六七八九十][）)]|[四五六七八九十]{1,3}、|业绩比较基准|投资限制|投资禁止)/);
    if (end > 20) rest = rest.slice(0, end);
    return rest.trim();
  }
  return chapter(text, ["投资策略"], ["投资限制", "投资比例", "业绩比较基准"]);
}

const LABEL_LINE = /^(?:及比例|(?:[（(]?[0-9一二三四五六七八九十]+[）).、．]\s*)?(?:主要)?投资(?:方向|比例)(?:及比例)?(?:（占[^）]*）)?[：:]?|[（(]?[0-9一二三四五六七八九十]+[）).、．]?)$/;

function investmentBlock(basic, anchorRe, stopRe) {
  const flags = anchorRe.flags.includes("g") ? anchorRe.flags : anchorRe.flags + "g";
  const finder = new RegExp(anchorRe.source, flags);
  for (const found of basic.matchAll(finder)) {
    const from = Math.max(0, basic.lastIndexOf("\n", found.index) + 1);
    const stop = basic.slice(found.index + found[0].length).search(stopRe);
    let end = stop > 20 ? found.index + found[0].length + stop : found.index + 5000;
    const body = basic.slice(from, end).split("\n").map((line) => line.trim()).filter((line) => line && !LABEL_LINE.test(line)).join("\n").trim();
    if (/投资于|固定收益|银行存款|现金|本计划/.test(body.slice(0, 180))) return body;
  }
  return "";
}

function fieldFeeBlock(basic) {
  const parts = [];
  const participate = basic.match(/参与费率[^\n%]{0,20}(\d+(?:\.\d+)?)%/);
  const exit = basic.match(/退出费率[^\n%]{0,20}(\d+(?:\.\d+)?)%/);
  const mgmt = basic.match(/(?:年固定)?管理费率[^\n%]{0,20}(\d+(?:\.\d+)?)%/);
  const custody = basic.match(/托管费率[^\n%]{0,20}(\d+(?:\.\d+)?)%/);
  if (participate) parts.push(`1、参与费率：${participate[1]}%`);
  if (exit) parts.push(`2、退出费率：${exit[1]}%`);
  if (mgmt) parts.push(`3、年固定管理费率：${mgmt[1]}%`);
  if (custody) parts.push(`4、年托管费率：${custody[1]}%`);
  return parts.join("\n");
}

function fieldPerformance(basic) {
  if (/不提取业绩报酬|不收取业绩报酬/.test(basic)) return "本集合计划管理人不提取业绩报酬。";
  const stated = basic.match(/计提基准\s*(\d+(?:\.\d+)?)\s*%[^。\n]{0,40}提取\s*(\d+(?:\.\d+)?)\s*%/);
  if (stated) return `本集合计划对年化收益超过${stated[1]}%的部分提取${stated[2]}%的业绩报酬。`;
  const loose = basic.match(/提取\s*(\d+(?:\.\d+)?)\s*%[^。\n]{0,12}业绩报酬/);
  if (loose) return `本集合计划对超过业绩报酬计提基准的收益部分提取${loose[1]}%的业绩报酬。`;
  return chapter(basic, ["业绩报酬"], ["收益分配", "不列入"]) || "";
}

function fieldRisk(basic) {
  let code = "";
  let word = "";
  const pair = basic.match(/(中低风险|中高风险|中风险|低风险|高风险)\s*[（(]\s*(R[1-5])\s*[）)]|(R[1-5])\s*[（(]\s*(中低风险|中高风险|中风险|低风险|高风险)\s*[）)]/);
  if (pair) {
    code = pair[2] || pair[3];
    word = pair[1] || pair[4];
  } else {
    const onlyCode = basic.match(/风险评级评价为[^。\n]{0,12}(R[1-5])/);
    const onlyWord = basic.match(/风险评级评价为(中低风险|中高风险|中风险|低风险|高风险)/);
    word = onlyWord ? onlyWord[1] : "";
    code = onlyCode ? onlyCode[1] : ({ 低风险: "R1", 中低风险: "R2", 中风险: "R3", 中高风险: "R4", 高风险: "R5" }[word] || "");
    if (code && !word) word = RISK_WORD[code];
  }
  const suit = (basic.match(/(C[1-5](?:[、,，]\s*C[1-5])*)/) || [])[1] || "";
  return { code, word, suit: suit.replace(/\s+/g, "") };
}

function splitBefore(text, mark) {
  if (!text || !text.includes(mark)) return text;
  const at = text.indexOf("\n" + mark);
  return at > 40 ? text.slice(0, at).trim() : text;
}

function subscribeFees(...chunks) {
  for (const src of chunks) {
    if (!src) continue;
    if (/认购费|参与费|退出费/.test(src)) {
      const m = src.match(/认购费[\s\S]{0,500}?(?=（二）|（三）|管理费|$)/);
      return (m ? m[0] : src).trim();
    }
  }
  return "本计划不收取认购费、参与费和退出费。";
}

function investorRights(text) {
  const m = text.match(/投资者享有如下权利[\s\S]{20,2500}?(?=\n二、管理人|\n二、托管人|\n（二）投资者承担|$)/);
  return m ? m[0].trim() : text.slice(0, 2000);
}
