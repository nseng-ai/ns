export function appHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TypeScript Plan Viewer</title>
<style>
:root { color-scheme: light dark; --border: #8a8f9833; --muted: #697386; --accent: #3b82f6; --bg-soft: #8a8f9818; }
* { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.app { display: grid; grid-template-columns: minmax(260px, 28vw) 1fr; min-height: 100vh; }
aside { border-right: 1px solid var(--border); padding: 1rem; overflow: auto; }
main { min-width: 0; padding: 1rem 1.25rem; overflow: auto; }
h1, h2, h3 { margin: 0 0 .5rem; }
.header { border-bottom: 1px solid var(--border); margin: -1rem -1.25rem 1rem; padding: 1rem 1.25rem; }
.trust { border: 1px solid #d88b00aa; background: #d88b0018; border-radius: .5rem; padding: .75rem; margin-top: .75rem; font-size: .9rem; }
.muted { color: var(--muted); }
.plan-list { display: grid; gap: .5rem; margin-top: 1rem; }
.plan-button { border: 1px solid var(--border); border-radius: .6rem; background: transparent; color: inherit; cursor: pointer; padding: .7rem; text-align: left; width: 100%; }
.plan-button:hover, .plan-button.active { border-color: var(--accent); background: var(--bg-soft); }
.plan-title { display: block; font-weight: 700; overflow-wrap: anywhere; }
.plan-meta { display: block; color: var(--muted); font-size: .8rem; margin-top: .25rem; overflow-wrap: anywhere; }
.tabs { display: flex; gap: .5rem; border-bottom: 1px solid var(--border); margin-bottom: 1rem; }
.tab { border: 0; border-bottom: 3px solid transparent; background: transparent; color: inherit; cursor: pointer; padding: .75rem .5rem; }
.tab.active { border-bottom-color: var(--accent); color: var(--accent); }
.panel { max-width: 1100px; }
.card { border: 1px solid var(--border); border-radius: .7rem; padding: .9rem; margin: .75rem 0; background: var(--bg-soft); }
.section-label { color: var(--muted); font-size: .78rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
ul { margin-top: .35rem; }
pre { border: 1px solid var(--border); border-radius: .7rem; overflow: auto; padding: 1rem; white-space: pre-wrap; background: var(--bg-soft); }
.error { border-color: #dc2626aa; background: #dc262618; }
.flow { display: grid; gap: .75rem; }
.flow-row { display: flex; flex-wrap: wrap; gap: .5rem; align-items: stretch; }
.node { border: 1px solid var(--border); border-radius: .55rem; padding: .6rem; min-width: 12rem; background: Canvas; }
.node.goal { border-color: #3b82f6aa; }
.node.phase { border-color: #8b5cf6aa; }
.node.task { border-color: #16a34aaa; }
.node.note { border-color: #f59e0baa; }
.node.validation { border-color: #dc2626aa; }
.node-kind { display: block; color: var(--muted); font-size: .7rem; font-weight: 700; text-transform: uppercase; }
.empty { padding: 2rem; border: 1px dashed var(--border); border-radius: .7rem; text-align: center; }
@media (max-width: 760px) { .app { grid-template-columns: 1fr; } aside { border-right: 0; border-bottom: 1px solid var(--border); } }
</style>
</head>
<body>
<div class="app">
	<aside>
		<h1>TypeScript plans</h1>
		<p class="muted">Saved .plan.ts files from the configured planned-branch Local plan store.</p>
		<div id="sidebar-status" class="muted">Loading plans…</div>
		<div id="plan-list" class="plan-list"></div>
	</aside>
	<main>
		<div class="header">
			<h2 id="selected-title">Select a plan</h2>
			<div id="selected-meta" class="muted">No plan selected.</div>
			<div id="trust-notice" class="trust" hidden></div>
		</div>
		<div class="tabs" role="tablist">
			<button class="tab active" data-tab="outline" type="button">Outline</button>
			<button class="tab" data-tab="graph" type="button">Graph</button>
			<button class="tab" data-tab="rendered" type="button">Rendered</button>
			<button class="tab" data-tab="source" type="button">Source</button>
		</div>
		<section id="panel" class="panel empty">Choose a saved TypeScript plan from the sidebar.</section>
	</main>
</div>
<script>
(function () {
	const state = { plans: [], selectedPlan: null, selectedData: null, activeTab: "outline" };
	const planList = document.getElementById("plan-list");
	const sidebarStatus = document.getElementById("sidebar-status");
	const selectedTitle = document.getElementById("selected-title");
	const selectedMeta = document.getElementById("selected-meta");
	const trustNotice = document.getElementById("trust-notice");
	const panel = document.getElementById("panel");

	function clear(node) {
		while (node.firstChild) node.removeChild(node.firstChild);
	}

	function el(tag, options) {
		const node = document.createElement(tag);
		if (!options) return node;
		if (options.className) node.className = options.className;
		if (options.textContent !== undefined) node.textContent = options.textContent;
		return node;
	}

	async function apiGet(path) {
		const response = await fetch(path);
		const body = await response.json();
		if (!body.success) {
			throw new Error(body.error && body.error.message ? body.error.message : "Request failed");
		}
		return body.data;
	}

	async function loadPlans() {
		try {
			const data = await apiGet("/api/plans");
			state.plans = data.plans;
			renderPlanList();
		} catch (error) {
			sidebarStatus.textContent = error instanceof Error ? error.message : String(error);
			const retry = el("button", { textContent: "Retry" });
			retry.type = "button";
			retry.addEventListener("click", loadPlans);
			clear(planList);
			planList.appendChild(retry);
		}
	}

	function renderPlanList() {
		clear(planList);
		if (state.plans.length === 0) {
			sidebarStatus.textContent = "No saved .plan.ts plans found.";
			return;
		}
		sidebarStatus.textContent = String(state.plans.length) + " saved TypeScript plan(s).";
		for (const plan of state.plans) {
			const button = el("button", { className: "plan-button" });
			button.type = "button";
			if (state.selectedPlan && state.selectedPlan.id === plan.id) button.classList.add("active");
			button.appendChild(el("span", { className: "plan-title", textContent: plan.slug }));
			button.appendChild(el("span", { className: "plan-meta", textContent: plan.repoKey + " / " + plan.branchKey }));
			button.appendChild(el("span", { className: "plan-meta", textContent: plan.fileName + " · " + plan.byteCount + " bytes" }));
			button.addEventListener("click", function () { selectPlan(plan); });
			planList.appendChild(button);
		}
	}

	async function selectPlan(plan) {
		state.selectedPlan = plan;
		state.selectedData = null;
		selectedTitle.textContent = plan.slug;
		selectedMeta.textContent = plan.repoKey + " / " + plan.branchKey + " / " + plan.fileName;
		trustNotice.hidden = true;
		renderPlanList();
		renderLoading("Loading selected plan…");

		const encodedId = encodeURIComponent(plan.id);
		const structured = settle(apiGet("/api/plans/" + encodedId + "/preview?format=structured"));
		const text = settle(apiGet("/api/plans/" + encodedId + "/preview?format=text"));
		const mermaid = settle(apiGet("/api/plans/" + encodedId + "/preview?format=mermaid"));
		const source = settle(apiGet("/api/plans/" + encodedId + "/source"));
		state.selectedData = {
			structured: await structured,
			text: await text,
			mermaid: await mermaid,
			source: await source,
		};
		const notice = noticeFromSelectedData(state.selectedData);
		trustNotice.textContent = notice;
		trustNotice.hidden = notice.length === 0;
		renderActiveTab();
	}

	async function settle(promise) {
		try {
			return { ok: true, value: await promise };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	function noticeFromSelectedData(data) {
		if (data.structured.ok) return data.structured.value.trustNotice;
		if (data.text.ok) return data.text.value.preview.trustNotice;
		if (data.mermaid.ok) return data.mermaid.value.preview.trustNotice;
		return "";
	}

	function renderLoading(message) {
		clear(panel);
		panel.className = "panel empty";
		panel.textContent = message;
	}

	function renderActiveTab() {
		for (const tab of document.querySelectorAll(".tab")) {
			tab.classList.toggle("active", tab.dataset.tab === state.activeTab);
		}
		if (!state.selectedData) {
			renderLoading("Choose a saved TypeScript plan from the sidebar.");
			return;
		}
		clear(panel);
		panel.className = "panel";
		if (state.activeTab === "outline") renderOutline(panel, state.selectedData.structured);
		else if (state.activeTab === "graph") renderGraph(panel, state.selectedData.structured, state.selectedData.mermaid);
		else if (state.activeTab === "rendered") renderPreview(panel, state.selectedData.text, "Rendered text preview");
		else renderSource(panel, state.selectedData.source);
	}

	function renderResultError(container, result) {
		const card = el("div", { className: "card error" });
		card.appendChild(el("strong", { textContent: "Could not render this view" }));
		card.appendChild(el("p", { textContent: result.message }));
		container.appendChild(card);
	}

	function renderOutline(container, result) {
		if (!result.ok) {
			renderResultError(container, result);
			return;
		}
		const model = result.value.model;
		if (model.title) container.appendChild(el("h2", { textContent: model.title }));
		if (model.summary) container.appendChild(sectionCard("Summary", model.summary));
		container.appendChild(sectionCard("Goal", model.goal || "(not specified)"));
		if (model.context) container.appendChild(sectionCard("Context", model.context));
		container.appendChild(el("h3", { textContent: "Phases" }));
		for (const phase of model.phases) {
			const card = el("article", { className: "card" });
			card.appendChild(el("h3", { textContent: phase.title }));
			if (phase.prompt) card.appendChild(sectionCard("Prompt", phase.prompt));
			appendList(card, "Tasks", phase.tasks);
			appendList(card, "Notes", phase.notes);
			appendList(card, "Validations", phase.validations);
			container.appendChild(card);
		}
		if (model.finalItems.length > 0) {
			const card = el("article", { className: "card" });
			card.appendChild(el("h3", { textContent: "Final items" }));
			for (const item of model.finalItems) {
				const text = item.type === "task" ? item.prompt : item.type === "note" ? item.text : item.command;
				card.appendChild(sectionCard(item.type, text));
			}
			container.appendChild(card);
		}
	}

	function sectionCard(label, text) {
		const card = el("div", { className: "card" });
		card.appendChild(el("div", { className: "section-label", textContent: label }));
		card.appendChild(el("div", { textContent: text }));
		return card;
	}

	function appendList(container, label, values) {
		if (!values || values.length === 0) return;
		container.appendChild(el("div", { className: "section-label", textContent: label }));
		const list = el("ul");
		for (const value of values) list.appendChild(el("li", { textContent: value }));
		container.appendChild(list);
	}

	function renderGraph(container, structuredResult, mermaidResult) {
		if (!structuredResult.ok) {
			renderResultError(container, structuredResult);
			return;
		}
		const model = structuredResult.value.model;
		const flow = el("div", { className: "flow" });
		const goalRow = el("div", { className: "flow-row" });
		goalRow.appendChild(graphNode("goal", "Goal", model.title ? model.title + " — " + model.goal : model.goal));
		flow.appendChild(goalRow);
		for (const phase of model.phases) {
			const row = el("div", { className: "flow-row" });
			row.appendChild(graphNode("phase", "Phase", phase.title));
			for (const task of phase.tasks) row.appendChild(graphNode("task", "Task", task));
			for (const note of phase.notes) row.appendChild(graphNode("note", "Note", note));
			for (const validation of phase.validations) row.appendChild(graphNode("validation", "Validation", validation));
			flow.appendChild(row);
		}
		if (model.finalItems.length > 0) {
			const row = el("div", { className: "flow-row" });
			for (const item of model.finalItems) {
				const text = item.type === "task" ? item.prompt : item.type === "note" ? item.text : item.command;
				row.appendChild(graphNode(item.type, "Final " + item.type, text));
			}
			flow.appendChild(row);
		}
		container.appendChild(flow);
		container.appendChild(el("h3", { textContent: "Mermaid source" }));
		if (mermaidResult.ok) appendPre(container, mermaidResult.value.preview.content);
		else renderResultError(container, mermaidResult);
	}

	function graphNode(kind, label, text) {
		const node = el("div", { className: "node " + kind });
		node.appendChild(el("span", { className: "node-kind", textContent: label }));
		node.appendChild(el("span", { textContent: text || "(not specified)" }));
		return node;
	}

	function renderPreview(container, result, title) {
		if (!result.ok) {
			renderResultError(container, result);
			return;
		}
		container.appendChild(el("h3", { textContent: title }));
		appendPre(container, result.value.preview.content);
	}

	function renderSource(container, result) {
		if (!result.ok) {
			renderResultError(container, result);
			return;
		}
		container.appendChild(el("h3", { textContent: "Source" }));
		appendPre(container, result.value.source);
	}

	function appendPre(container, text) {
		const pre = el("pre");
		pre.textContent = text;
		container.appendChild(pre);
	}

	for (const tab of document.querySelectorAll(".tab")) {
		tab.addEventListener("click", function () {
			state.activeTab = tab.dataset.tab;
			renderActiveTab();
		});
	}

	loadPlans();
})();
</script>
</body>
</html>`;
}
