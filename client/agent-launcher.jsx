import React, { useEffect } from "react";
import { useApp } from "./context";
import avatar from "./assets/jiaoneng-ai-v2.png";
export const pageAgent = {
  demands: "DEMAND",
  orders: "DEMAND",
  simulation: "SIMULATION",
  tasks: "DISPATCH",
  resources: "DISPATCH",
  charging: "CHARGING",
  stations: "CHARGING",
  energy: "CHARGING",
  monitoring: "DISPATCH",
  cockpit: "DISPATCH",
  alerts: "INCIDENT",
  planning: "PLANNING",
  deployment: "PLANNING",
};
export function AgentContextSync({ context }) {
  const a = useApp(),
    serialized = JSON.stringify(context);
  useEffect(() => {
    a.setAgentContext?.({ ...context, page: a.currentPage });
  }, [serialized, a.currentPage]);
  return null;
}
export default function AgentLauncher({ page, context }) {
  const a = useApp();
  if (
    page === "assistant" ||
    page === "cockpit" ||
    a.user.role !== "admin" ||
    !a.can("ai.use") ||
    !a.can("read")
  )
    return null;
  function open() {
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    let entry = { capability: pageAgent[page] || "AUTO" };
    if (context?.page === page) entry = { ...entry, ...context };
    else if (params.get("task"))
      entry = {
        ...entry,
        context_resource: "tasks",
        context_id: params.get("task"),
      };
    else if (params.get("incident"))
      entry = {
        ...entry,
        context_resource: "alerts",
        context_id: params.get("incident"),
      };
    else if (params.get("plan"))
      entry = {
        ...entry,
        context_resource: "charging",
        context_id: params.get("plan"),
      };
    else if (params.get("order_id") || params.get("order"))
      entry = {
        ...entry,
        context_resource: "orders",
        context_id: params.get("order_id") || params.get("order"),
      };
    else if (params.get("station"))
      entry = {
        ...entry,
        context_resource: "stations",
        context_id: params.get("station"),
      };
    else if (["planning", "deployment"].includes(page)) {
      const id = sessionStorage.getItem("planner-project-" + a.user.id);
      if (id)
        entry = {
          ...entry,
          context_resource: "planning-projects",
          context_id: id,
        };
    }
    entry.draft={...(entry.draft||{}),page_context:{page,title:context?.draft?.page_context?.title||document.querySelector('.content h1')?.textContent||page,summary:JSON.stringify({filters:a.transportQueries?.[page]||{},...(context?.page===page?{current:context.draft||{}}:{})}).slice(0,2400)}};
    a.openPageAssistant({
      agent_entry: entry,
      return_hash: location.hash || "#overview",
    });
  }
  return (
    <button
      className="agent-global-launcher"
      aria-label="打开本页AI助手"
      onClick={open}
    >
      <img src={avatar} alt="" />
      <span>交能AI</span>
    </button>
  );
}
