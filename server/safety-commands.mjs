import { must, text, insert, now, uid, unpack } from "./db.mjs";
import { get, allowed, version, owner } from "./repository.mjs";
import { patch, makeCode } from "./transport.mjs";
import { incidentStage } from "./safety-workspace.mjs";

const date = (value, label) => {
  const d = new Date(value);
  must(
    typeof value === "string" && value && Number.isFinite(+d),
    "请填写有效的" + label,
  );
  return d.toISOString();
};
function actorFor(db, user, id, ownerId) {
  const u = db
    .prepare("SELECT id,name,role,enabled,operations FROM users WHERE id=?")
    .get(text(id, "处理人", 100));
  must(u && u.role === "admin" && u.enabled === 1, "处理人须为有效管理员");
  const ops = JSON.parse(u.operations);
  must(
    ops.includes("*") || ops.includes("alert.write"),
    "处理人没有异常处置权限",
  );
  must(
    db
      .prepare("SELECT 1 FROM user_scopes WHERE user_id=? AND owner_id=?")
      .get(u.id, ownerId),
    "处理人无该主体权限",
  );
  return { assignee_id: u.id, assignee: u.name };
}
const step = (r, user, label, note, publicNote = "") => [
  ...(Array.isArray(r.history) ? r.history : []),
  {
    id: uid("IH"),
    at: now(),
    actor_id: user.id,
    actor: user.name,
    label,
    note,
    public: !!publicNote,
    public_note: publicNote,
  },
];
function validLinks(db, user, b) {
  must(
    b.task_ids === undefined || Array.isArray(b.task_ids),
    "关联任务格式无效",
  );
  must(
    b.plan_ids === undefined || Array.isArray(b.plan_ids),
    "补能计划格式无效",
  );
  const one = (resource, key) =>
    b[key] ? get(db, user, resource, text(b[key], key, 150)) : null;
  const taskIds = Array.isArray(b.task_ids) ? b.task_ids : [],
    planIds = Array.isArray(b.plan_ids) ? b.plan_ids : [];
  must(
    taskIds.length <= 100 && planIds.length <= 100,
    "单次最多关联100个任务/计划",
  );
  const tasks = [...new Set([b.task_id, ...taskIds].filter(Boolean))].map(
    (id) => get(db, user, "tasks", text(id, "任务", 150)),
  );
  const plans = [...new Set([b.plan_id, ...planIds].filter(Boolean))].map(
    (id) => get(db, user, "charging", text(id, "补能计划", 150)),
  );
  const vehicle = one("vehicles", "vehicle_id"),
    device = one("devices", "device_id");
  const station =
    one("stations", "station_id") ||
    (device ? get(db, user, "stations", device.station_id) : null);
  for (const p of plans)
    if (p.task_id && !tasks.some((t) => t.id === p.task_id))
      tasks.push(get(db, user, "tasks", p.task_id));
  const owners = [...tasks, ...plans, vehicle, device, station]
    .filter(Boolean)
    .map((x) => x.owner_id);
  const ownerId = owners[0] || b.owner_id;
  owner(user, ownerId);
  must(
    owners.every((id) => id === ownerId),
    "关联对象必须属于同一业务主体",
  );
  if (vehicle)
    must(
      [...tasks, ...plans].every((t) => t.vehicle_id === vehicle.id),
      "车辆与关联任务/计划不一致",
    );
  if (station)
    must(
      plans.every((p) => p.station_id === station.id),
      "场站与补能计划不一致",
    );
  if (device && station)
    must(device.station_id === station.id, "设备不属于所选场站");
  return { ownerId, tasks, plans, vehicle, station, device };
}
export function safetyCommand(db, user, type, id, b) {
  if (!type.startsWith("incident.")) return null;
  if (type === "incident.report") {
    must(user.role === "admin", "请从本人任务或补能安排报告异常", 403);
    allowed(user, "alert.write");
    const x = validLinks(db, user, b),
      kind = text(b.incident_type || b.name, "异常类型", 100);
    const report = text(b.report || b.reason, "异常情况");
    const objectId =
      x.device?.id ||
      x.station?.id ||
      x.vehicle?.id ||
      x.tasks
        .map((t) => t.id)
        .sort()
        .join(",") ||
      "owner";
    const dedupKey = JSON.stringify([x.ownerId, kind, objectId]);
    const existing = db
      .prepare(
        "SELECT * FROM alerts WHERE owner_id=? AND status<>'已关闭' AND json_extract(data,'$.dedup_key')=? ORDER BY created_at DESC LIMIT 1",
      )
      .get(x.ownerId, dedupKey);
    const severity = ["紧急", "较高", "重要", "一般", "待核实"].includes(
      b.severity,
    )
      ? b.severity
      : "待核实";
    if (existing) {
      const r = unpack(existing);
      const data = {
        ...r,
        history: step(r, user, "追加同类报告", report, "收到补充报告"),
        task_ids: [
          ...new Set(
            [
              ...(r.task_ids || []),
              r.task_id,
              ...x.tasks.map((t) => t.id),
            ].filter(Boolean),
          ),
        ],
        plan_ids: [
          ...new Set(
            [
              ...(r.plan_ids || []),
              r.plan_id,
              ...x.plans.map((t) => t.id),
            ].filter(Boolean),
          ),
        ],
      };
      patch(db, "alerts", r.id, { data });
      return { id: r.id, merged: true };
    }
    id = uid("A");
    insert(db, "alerts", {
      id,
      code: makeCode("YJ"),
      name: kind,
      owner_id: x.ownerId,
      task_id: x.tasks[0]?.id || null,
      vehicle_id:
        x.vehicle?.id ||
        x.tasks[0]?.vehicle_id ||
        x.plans[0]?.vehicle_id ||
        null,
      status: "待受理",
      severity,
      created_at: now(),
      source: "MANUAL_SIMULATION",
      data: {
        cr019: true,
        incident_type: kind,
        dedup_key: dedupKey,
        report,
        evidence: b.evidence || "",
        kind: "人工反馈",
        task_ids: x.tasks.map((t) => t.id),
        plan_ids: x.plans.map((t) => t.id),
        station_id: x.station?.id || null,
        device_id: x.device?.id || null,
        history: step(
          {},
          user,
          "登记异常",
          report,
          "异常已登记，等待管理员受理",
        ),
      },
    });
    return { id, merged: false };
  }
  get(db, user, "alerts", text(id, "异常编号", 150));
  const r = unpack(db.prepare("SELECT * FROM alerts WHERE id=?").get(id));
  version(r, b);
  const stage = incidentStage(r.status);
  if (["incident.driver-feedback", "incident.driver-ack"].includes(type)) {
    must(user.role === "driver", "仅本人司机可反馈", 403);
    allowed(user, "driver.execute");
    must(stage !== "closed", "异常已关闭，如仍有问题请重新上报");
    if (type === "incident.driver-ack") {
      must(
        r.instruction && b.instruction_revision === r.instruction_revision,
        "处置要求已更新，请刷新后确认",
        409,
      );
      patch(db, "alerts", id, {
        data: {
          ...r,
          driver_receipts: {
            ...(r.driver_receipts || {}),
            [user.driver_id]: { revision: r.instruction_revision, at: now() },
          },
          history: step(
            r,
            user,
            "司机确认收到",
            "确认当前处置要求",
            "司机已确认收到当前要求",
          ),
        },
      });
    } else {
      const report = text(b.report, "补充情况");
      patch(db, "alerts", id, {
        data: {
          ...r,
          driver_feedback: [
            ...(r.driver_feedback || []),
            {
              at: now(),
              driver_id: user.driver_id,
              report,
              evidence: b.evidence || "",
            },
          ],
          history: step(r, user, "司机补充", report, "司机已补充执行情况"),
        },
      });
    }
    return { id };
  }
  must(user.role === "admin", "仅管理员可处置异常", 403);
  allowed(user, "alert.write");
  let data = { ...r, cr019: true },
    status = r.status;
  const note = text(b.note || b.evidence, "处理/核验依据");
  let label, publicNote;
  if (type === "incident.link") {
    must(stage !== "closed", "已关闭异常不能更改关联业务");
    const x = validLinks(db, user, {
      ...b,
      owner_id: r.owner_id,
      station_id: b.station_id || r.station_id,
      device_id: b.device_id || r.device_id,
    });
    must(x.ownerId === r.owner_id, "不能关联其他业务主体");
    data.task_ids = [
      ...new Set(
        [...(r.task_ids || []), r.task_id, ...x.tasks.map((t) => t.id)].filter(
          Boolean,
        ),
      ),
    ];
    data.plan_ids = [
      ...new Set(
        [...(r.plan_ids || []), r.plan_id, ...x.plans.map((p) => p.id)].filter(
          Boolean,
        ),
      ),
    ];
    label = "核对关联业务";
    publicNote = "管理员已核对受影响业务";
  } else if (type === "incident.accept") {
    must(stage === "pending", "仅待受理异常可受理");
    data = {
      ...data,
      ...actorFor(db, user, b.assignee_id, r.owner_id),
      due_at: date(b.due_at, "要求反馈时间"),
      measures: note,
    };
    status = "处理中";
    label = "受理并指派";
    publicNote = "管理员已受理，正在处理";
  } else if (type === "incident.transfer") {
    must(["pending", "working", "verify"].includes(stage), "当前不可转交");
    data = {
      ...data,
      ...actorFor(db, user, b.assignee_id, r.owner_id),
      due_at: date(b.due_at, "要求反馈时间"),
    };
    label = "转交处理";
    publicNote = "处理责任人已更新";
  } else if (type === "incident.update") {
    must(stage === "working", "仅处理中可记录处理进展");
    data.measures = note;
    label = "补充处置进展";
    publicNote = "管理员已更新处理进展";
  } else if (type === "incident.resolve") {
    must(stage === "working", "仅处理中可提交核验");
    must(
      ["已恢复", "误报已核实"].includes(b.recovery),
      "请确认已恢复或误报已核实；未恢复应继续处理",
    );
    must(r.assignee_id, "请先明确处理人");
    const evidence = text(b.proof, "处理结果凭证");
    data.result = {
      summary: note,
      public_summary: b.public_summary
        ? text(b.public_summary, "司机可见结果")
        : "处置结果已登记，恢复情况：" + b.recovery,
      recovery: b.recovery,
      evidence,
      at: now(),
      by: user.id,
    };
    status = "待关闭";
    label = "提交处理结果";
    publicNote = "处理结果已提交，等待核验";
  } else if (type === "incident.return") {
    must(stage === "verify", "仅待核验可退回");
    status = "处理中";
    label = "核验退回";
    publicNote = "核验未通过，继续处理";
  } else if (type === "incident.close") {
    must(stage === "verify", "仅待核验可关闭");
    must(b.responsibility_resolved === true, "请确认现场及在途责任已处理");
    must(
      r.result && ["已恢复", "误报已核实"].includes(r.result.recovery),
      "缺少有效处理结果，请退回补充",
    );
    data.verification = { evidence: note, at: now(), by: user.id };
    status = "已关闭";
    label = "核验关闭";
    publicNote = "异常已核验关闭";
  } else if (type === "incident.reopen") {
    must(stage === "closed", "仅已关闭异常可重新受理");
    status = "待受理";
    label = "重新受理";
    publicNote = "异常已重新受理";
    data.previous_results = [
      ...(r.previous_results || []),
      { result: r.result, verification: r.verification },
    ];
    data.result = null;
    data.verification = null;
  } else must(false, "异常处置动作不存在", 404);
  if (b.instruction !== undefined) {
    must(
      typeof b.instruction === "string" && b.instruction.length <= 2000,
      "司机执行要求最多2000字",
    );
    if (b.instruction !== r.instruction) {
      data.instruction = b.instruction.trim();
      data.instruction_revision = (r.instruction_revision || 0) + 1;
      publicNote += "，请查看最新执行要求";
    }
  }
  data.history = step(r, user, label, note, publicNote);
  patch(db, "alerts", id, { status, data });
  return { id };
}
export function guardSafetyMutation(db, user, type, id) {
  if (type.startsWith("alert.") && type !== "alert.report" && id) {
    const r = get(db, user, "alerts", id);
    must(!r.cr019, "请在异常处置工作区核对当前要求和结果后操作");
  }
}
