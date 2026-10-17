import React, { useEffect, useRef, useState } from "react";
import { Button } from "@lobehub/ui";
import {
  Input,
  InputNumber,
  Select,
  Table,
  Drawer,
  Alert,
  Empty,
  Spin,
  Dropdown,
  Pagination,
} from "antd";
import {
  Plus,
  Search,
  RotateCcw,
  X,
  Package,
  ArrowDown,
  MoreHorizontal,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { useApp } from "./context";
import { list, detail } from "./api";
import { Heading, Card, Pill, format, time, RecordDetail, Source } from "./ui";

const localDate = (value) => {
  const d = new Date(value || Date.now());
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const windowDefaults = () => {
  const d = new Date();
  if (d.getHours() >= 20) d.setDate(d.getDate() + 1);
  d.setHours(Math.max(6, d.getHours() >= 20 ? 6 : d.getHours()), 0, 0, 0);
  return { start_at: localDate(d), finish_at: localDate(+d + 8 * 3600000) };
};
const tonnes = (value) => format((value || 0) / 1000, 3);
const businessStates = {
  demands: ["草稿", "已确认", "已终止"],
  orders: ["草稿", "已确认", "已完成", "已取消"],
};
const progress = (r) =>
  r.status === "已终止"
    ? "已终止"
    : r.status === "草稿"
      ? "待确认"
      : !r.allocated_kg
        ? "待分配"
        : r.allocated_kg < r.quantity_kg
          ? "部分分配"
          : "已分配";
function RouteCell({ row }) {
  return (
    <div className="transport-route">
      <div>
        <span className="route-origin">起</span>
        {row.origin}
      </div>
      <div>
        <span className="route-destination">终</span>
        {row.destination}
      </div>
    </div>
  );
}
function QuantitySummary({ demand, total = 0 }) {
  const remaining = (demand.quantity_kg - demand.allocated_kg) / 1000;
  return (
    <div className="allocation-summary">
      <div>
        <span>需求总量</span>
        <strong>
          {tonnes(demand.quantity_kg)}
          <small>吨</small>
        </strong>
      </div>
      <div>
        <span>已分配</span>
        <strong>
          {tonnes(demand.allocated_kg)}
          <small>吨</small>
        </strong>
      </div>
      <div>
        <span>待分配</span>
        <strong>
          {format(remaining, 3)}
          <small>吨</small>
        </strong>
      </div>
      {total > 0 && (
        <div className={total > remaining ? "quantity-overflow" : ""}>
          <span>本次安排</span>
          <strong>
            {format(total, 3)}
            <small>吨</small>
          </strong>
        </div>
      )}
    </div>
  );
}

export function Demands() {
  return <TransportWorkbench resource="demands" />;
}
export function Orders() {
  return <TransportWorkbench resource="orders" />;
}
function TransportWorkbench({ resource }) {
  const a = useApp(),
    isDemand = resource === "demands",
    title = isDemand ? "运输需求" : "运输订单";
  const initial = a.transportQueries[resource] || {
    q: "",
    status: "",
    page: 1,
    pageSize: 10,
    sort: "created_at",
    direction: "desc",
  };
  const [query, setQueryState] = useState(() => ({
      ...initial,
      ...(!isDemand && a.intentDraft?.demand_id
        ? { demand: a.intentDraft.demand_id, page: 1 }
        : {}),
    })),
    [draft, setDraft] = useState(query),
    [data, setData] = useState({ items: [], total: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [compact, setCompact] = useState(
    () => matchMedia("(max-width:767px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width:767px)");
    const change = () => setCompact(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const sequence = useRef(0);
  const setQuery = (value) => {
    setQueryState(value);
    a.setTransportQueries((v) => ({ ...v, [resource]: value }));
  };
  useEffect(() => {
    const n = ++sequence.current;
    setLoading(true);
    setError("");
    list(resource, query)
      .then((r) => {
        if (n === sequence.current) setData(r);
      })
      .catch((e) => {
        if (n === sequence.current) setError(e.message);
      })
      .finally(() => {
        if (n === sequence.current) setLoading(false);
      });
    return () => {
      sequence.current++;
    };
  }, [resource, JSON.stringify(query), a.revision]);
  const choose = (key, value) => setDraft((v) => ({ ...v, [key]: value }));
  const action = async (fn) => {
    try {
      await fn();
    } catch (e) {
      a.message.error(e.message);
    }
  };
  const confirmRow = (r) =>
    a.confirm(
      isDemand ? "确认需求" : "确认订单",
      isDemand
        ? `${r.name}，总需求 ${tonnes(r.quantity_kg)} 吨。`
        : `${r.code}，本批 ${tonnes(r.quantity_kg)} 吨，确认时核对来源需求余量。`,
      () =>
        a.execute(isDemand ? "demand.confirm" : "order.confirm", r.id, {
          expected_version: r.version,
        }),
    );
  const columns = [
    {
      title: isDemand ? "需求 / 货物" : "订单 / 货物",
      dataIndex: "code",
      width: 245,
      render: (v, r) => (
        <div className="transport-object">
          <span className="cargo-symbol">
            <Package size={23} />
          </span>
          <div>
            <button
              className="inline-link transport-object-name"
              onClick={() => a.showDetail(resource, r.id)}
            >
              {r.name}
            </button>
            <div className="small muted">
              {v} · {r.cargo}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "运输线路",
      key: "route",
      width: 225,
      render: (_, r) => <RouteCell row={r} />,
    },
    {
      title: isDemand ? "需求总量" : "计划 / 核验交付",
      dataIndex: "quantity_kg",
      width: 155,
      render: (v, r) => (
        <div className="quantity-cell">
          <strong>
            {tonnes(v)} <small>吨</small>
          </strong>
          {!isDemand && (
            <span className="small muted">
              已核验 {tonnes(r.verified_kg)} 吨
            </span>
          )}
        </div>
      ),
    },
    isDemand
      ? {
          title: "分配情况",
          key: "allocation",
          width: 180,
          render: (_, r) => (
            <div className="quantity-cell">
              <span>已分配 {tonnes(r.allocated_kg)} 吨</span>
              <span className="small muted">
                {r.status === "已终止"
                  ? "已停止分配"
                  : `待分配 ${tonnes(r.quantity_kg - r.allocated_kg)} 吨`}{" "}
                · {r.order_count || 0} 单
              </span>
            </div>
          ),
        }
      : {
          title: "来源需求",
          dataIndex: "demand_id",
          width: 160,
          render: (v) => (
            <button
              className="inline-link"
              onClick={() => a.showDetail("demands", v)}
            >
              {a.label("demand_id", v)}
            </button>
          ),
        },
    isDemand
      ? {
          title: "核验交付",
          dataIndex: "verified_kg",
          width: 130,
          render: (v) => tonnes(v) + " 吨",
        }
      : {
          title: "运输时间",
          dataIndex: "start_at",
          width: 180,
          render: (v, r) => (
            <div className="quantity-cell">
              <span>{time(v)}</span>
              <span className="small muted">至 {time(r.finish_at)}</span>
            </div>
          ),
        },
    {
      title: "状态",
      dataIndex: "status",
      width: 125,
      render: (v, r) => (
        <div className="quantity-cell">
          <Pill>{v}</Pill>
          {isDemand && v === "已确认" && (
            <span className="small muted">{progress(r)}</span>
          )}
        </div>
      ),
    },
    ...(isDemand
      ? [
          {
            title: "登记时间",
            dataIndex: "created_at",
            width: 150,
            render: time,
          },
        ]
      : []),
    {
      title: "操作",
      key: "action",
      width: 238,
      fixed: "right",
      render: (_, r) => (
        <div className="transport-row-actions">
          <Button
            type="link"
            size="small"
            onClick={() => a.showDetail(resource, r.id)}
          >
            详情
          </Button>
          {a.can(isDemand ? "demand.write" : "order.write") &&
            ["草稿", "已确认"].includes(r.status) && (
              <Button
                type="link"
                size="small"
                onClick={() => (isDemand ? a.editDemand(r) : a.editOrder(r))}
              >
                {r.status === "已确认" && !isDemand ? "调整" : "编辑"}
              </Button>
            )}
          {r.status === "草稿" &&
            a.can(isDemand ? "demand.write" : "order.write") && (
              <Button type="link" size="small" onClick={() => confirmRow(r)}>
                确认
              </Button>
            )}
          {isDemand &&
            r.status === "已确认" &&
            r.allocated_kg < r.quantity_kg &&
            a.can("order.write") && (
              <Button
                type="link"
                size="small"
                onClick={() => a.generateOrders(r)}
              >
                生成订单
              </Button>
            )}
          {!isDemand && r.status === "已确认" && a.can("simulation.run") && (
            <Button
              type="link"
              size="small"
              onClick={() => a.go("simulation", { order_id: r.id })}
            >
              进入推演
            </Button>
          )}
          {!isDemand && a.can("order.write") && (
            <Dropdown
              menu={{
                items: [{ key: "copy", label: "复制为草稿" }],
                onClick: () => action(() => a.execute("order.copy", r.id, {})),
              }}
            >
              <Button
                type="text"
                size="small"
                aria-label={"更多操作 " + r.code}
                icon={MoreHorizontal}
              />
            </Dropdown>
          )}
        </div>
      ),
    },
  ];
  return (
    <div className="transport-workbench">
      <Heading title={title} />
      <Card className="transport-search-card">
        <form
          className="transport-search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery({ ...draft, page: 1 });
          }}
        >
          <label className="transport-query-field">
            <span>关键词</span>
            <Input
              aria-label="搜索业务记录"
              placeholder="编号 / 名称 / 货物"
              allowClear
              value={draft.q}
              onChange={(e) => choose("q", e.target.value)}
            />
          </label>
          <label className="transport-query-field">
            <span>状态</span>
            <Select
              aria-label="业务状态筛选"
              allowClear
              placeholder="全部状态"
              value={draft.status || undefined}
              options={businessStates[resource].map((value) => ({
                value,
                label: value,
              }))}
              onChange={(v) => choose("status", v || "")}
            />
          </label>
          <label className="transport-query-field">
            <span>货物</span>
            <Input
              aria-label="货物筛选"
              placeholder="全部货物"
              allowClear
              value={draft.cargo}
              onChange={(e) => choose("cargo", e.target.value)}
            />
          </label>
          <label className="transport-query-field">
            <span>起运地</span>
            <Input
              aria-label="起运地筛选"
              placeholder="装货位置"
              allowClear
              value={draft.origin}
              onChange={(e) => choose("origin", e.target.value)}
            />
          </label>
          <label className="transport-query-field">
            <span>目的地</span>
            <Input
              aria-label="目的地筛选"
              placeholder="卸货位置"
              allowClear
              value={draft.destination}
              onChange={(e) => choose("destination", e.target.value)}
            />
          </label>
          {a.boot.organizations.length > 1 && (
            <label className="transport-query-field">
              <span>主体</span>
              <Select
                aria-label="业务主体筛选"
                allowClear
                placeholder="全部主体"
                value={draft.owner}
                options={a.boot.organizations.map((o) => ({
                  value: o.id,
                  label: o.name,
                }))}
                onChange={(v) => choose("owner", v)}
              />
            </label>
          )}
          <div className="transport-query-actions">
            <Button htmlType="submit" icon={Search} type="primary">
              查询
            </Button>
            <Button
              icon={RotateCcw}
              onClick={() => {
                const next = {
                  q: "",
                  status: "",
                  page: 1,
                  pageSize: 10,
                  sort: "created_at",
                  direction: "desc",
                };
                setDraft(next);
                setQuery(next);
              }}
            >
              重置
            </Button>
          </div>
        </form>
        {!isDemand && query.demand && (
          <div className="transport-source-filter">
            <span>来源需求：{a.label("demand_id", query.demand)}</span>
            <Button
              type="text"
              size="small"
              aria-label="清除来源需求筛选"
              icon={X}
              onClick={() => {
                const next = { ...query, demand: undefined, page: 1 };
                setDraft(next);
                setQuery(next);
              }}
            />
          </div>
        )}
      </Card>
      <Card
        className="transport-list-card"
        title={title + "列表"}
        extra={
          <div className="transport-list-tools">
            <span className="small muted">
              共 <b>{data.total}</b> 条
            </span>
            <Select
              aria-label="列表排序"
              value={query.sort + ":" + query.direction}
              options={[
                { value: "created_at:desc", label: "最新创建" },
                { value: "created_at:asc", label: "最早创建" },
                { value: "quantity_kg:desc", label: "运量从大到小" },
                ...(!isDemand
                  ? [{ value: "finish_at:asc", label: "最早要求完成" }]
                  : []),
              ]}
              onChange={(v) => {
                const [sort, direction] = v.split(":");
                const next = { ...query, sort, direction, page: 1 };
                setDraft((d) => ({ ...d, sort, direction }));
                setQuery(next);
              }}
            />
            {a.can(isDemand ? "demand.write" : "order.write") && (
              <Button
                type="primary"
                icon={Plus}
                onClick={() => (isDemand ? a.editDemand() : a.editOrder())}
              >
                {isDemand ? "新建运输需求" : "新建订单"}
              </Button>
            )}
          </div>
        }
      >
        {error ? (
          <div className="card-body">
            <Alert
              type="error"
              message={error}
              action={
                <Button size="small" onClick={() => a.refresh()}>
                  重试
                </Button>
              }
            />
          </div>
        ) : compact ? (
          <div className="transport-mobile-list" aria-busy={loading}>
            {loading ? (
              <div className="transport-mobile-loading">
                <Spin />
              </div>
            ) : data.items.length ? (
              data.items.map((r) => (
                <article
                  className="transport-mobile-card"
                  key={r.id}
                  aria-label={r.code}
                >
                  <header>
                    <div>
                      <button
                        className="inline-link"
                        onClick={() => a.showDetail(resource, r.id)}
                      >
                        {r.name}
                      </button>
                      <p className="small muted">
                        {r.code} · {r.cargo}
                      </p>
                    </div>
                    <Pill>{r.status}</Pill>
                  </header>
                  <RouteCell row={r} />
                  <div className="transport-mobile-quantities">
                    <div>
                      <span>{isDemand ? "需求总量" : "计划运量"}</span>
                      <strong>{tonnes(r.quantity_kg)} 吨</strong>
                    </div>
                    {isDemand && (
                      <div>
                        <span>待分配</span>
                        <strong>
                          {r.status === "已终止"
                            ? "已停止"
                            : tonnes(r.quantity_kg - r.allocated_kg) + " 吨"}
                        </strong>
                      </div>
                    )}
                    <div>
                      <span>核验交付</span>
                      <strong>{tonnes(r.verified_kg)} 吨</strong>
                    </div>
                  </div>
                  {!isDemand && (
                    <p className="small muted">
                      {time(r.start_at)} — {time(r.finish_at)}
                    </p>
                  )}
                  <footer>{columns.at(-1).render(null, r)}</footer>
                </article>
              ))
            ) : (
              <Empty description="没有符合条件的记录" />
            )}
            <Pagination
              size="small"
              current={query.page}
              pageSize={query.pageSize}
              total={data.total}
              showSizeChanger={false}
              onChange={(page) => setQuery({ ...query, page })}
            />
          </div>
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            dataSource={data.items}
            columns={columns}
            scroll={{ x: isDemand ? 1430 : 1390 }}
            pagination={{
              current: query.page,
              pageSize: query.pageSize,
              total: data.total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (t) => "共 " + t + " 条",
              onChange: (page, pageSize) =>
                setQuery({
                  ...query,
                  page: pageSize === query.pageSize ? page : 1,
                  pageSize,
                }),
            }}
            locale={{
              emptyText: (
                <Empty
                  description={
                    Object.values(query).some(
                      (v) =>
                        typeof v === "string" &&
                        v &&
                        !["created_at", "desc"].includes(v),
                    )
                      ? "没有符合条件的记录"
                      : "暂无记录"
                  }
                />
              ),
            }}
          />
        )}
      </Card>
    </div>
  );
}

export function TransportRecord({ resource, row: initialRow }) {
  const a = useApp(),
    [row, setRow] = useState(initialRow),
    [related, setRelated] = useState({ items: [], total: 0 }),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    detail(resource, initialRow.id)
      .then((r) => active && setRow(r))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [resource, initialRow.id, a.revision]);
  useEffect(() => {
    let active = true;
    if (resource === "demands")
      list("orders", { demand: row.id, page, pageSize: 10 })
        .then((r) => active && setRelated(r))
        .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [row.id, page, a.revision]);
  return (
    <div className="stack">
      <RecordDetail resource={resource} row={row} />
      {resource === "demands" && (
        <>
          <QuantitySummary demand={row} />
          <Card
            title="关联订单"
            extra={
              <Button
                size="small"
                onClick={() => a.go("orders", { demand_id: row.id })}
              >
                查看全部订单
              </Button>
            }
          >
            {error ? (
              <Alert type="error" message={error} />
            ) : (
              <Table
                size="small"
                rowKey="id"
                dataSource={related.items}
                pagination={{
                  current: page,
                  pageSize: 10,
                  total: related.total,
                  onChange: setPage,
                }}
                scroll={{ x: 450 }}
                columns={[
                  {
                    title: "订单",
                    dataIndex: "code",
                    render: (v, r) => (
                      <button
                        className="inline-link"
                        onClick={() => a.showDetail("orders", r.id)}
                      >
                        {v}
                      </button>
                    ),
                  },
                  {
                    title: "计划 / 核验（吨）",
                    dataIndex: "quantity_kg",
                    render: (v, r) => tonnes(v) + " / " + tonnes(r.verified_kg),
                  },
                  {
                    title: "状态",
                    dataIndex: "status",
                    render: (v) => <Pill>{v}</Pill>,
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}
      {resource === "orders" && (
        <div className="row">
          <Button onClick={() => a.showDetail("demands", row.demand_id)}>
            查看来源需求
          </Button>
          <Button onClick={() => a.go("charging", { order_id: row.id })}>
            查看关联补能安排
          </Button>
          <Button onClick={() => a.go("alerts", { order_id: row.id })}>
            查看关联异常
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  value,
  onChange,
  error,
  type = "text",
  options,
  disabled,
  min,
  children,
  full = false,
}) {
  const props = {
    id: "transport-" + name,
    "aria-label": label,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? "transport-error-" + name : undefined,
    value,
    onChange,
    disabled,
  };
  return (
    <div className={"field" + (full ? " field-full" : "")}>
      <label htmlFor={props.id}>{label}</label>
      {children ||
        (type === "number" ? (
          <InputNumber
            {...props}
            min={min ?? 0.001}
            precision={3}
            style={{ width: "100%" }}
          />
        ) : type === "select" ? (
          <Select
            {...props}
            options={options}
            showSearch
            optionFilterProp="label"
          />
        ) : type === "datetime" ? (
          <input
            {...props}
            type="datetime-local"
            onChange={(e) => onChange(e.target.value)}
          />
        ) : type === "textarea" ? (
          <Input.TextArea
            {...props}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />
        ) : (
          <Input {...props} onChange={(e) => onChange(e.target.value)} />
        ))}
      {error && (
        <small
          id={"transport-error-" + name}
          role="alert"
          className="field-error"
        >
          {error}
        </small>
      )}
    </div>
  );
}

export function TransportEditor({ editor, setEditor }) {
  const a = useApp(),
    [values, setValues] = useState({}),
    [items, setItems] = useState([]),
    [invalid, setInvalid] = useState({}),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [demand, setDemand] = useState(null),
    [choices, setChoices] = useState([]),
    [result, setResult] = useState(null),
    [readyEditor, setReadyEditor] = useState(null);
  const choiceSequence = useRef(0),
    choiceTimer = useRef();
  const isDemand = editor?.kind === "demand",
    isBatch = editor?.kind === "allocation",
    row = editor?.row,
    quick = editor?.returnTo,
    confirmed = row?.status === "已确认";
  useEffect(() => {
    if (!editor) return;
    const r = editor.row,
      d = editor.demand;
    setValues(
      editor.values ||
        (r
          ? {
              ...r,
              quantity: r.quantity_kg / 1000,
              ...(!isDemand
                ? {
                    start_at: localDate(r.start_at),
                    finish_at: localDate(r.finish_at),
                  }
                : {}),
            }
          : isDemand
            ? { owner_id: a.user.scopes[0], ...(editor.initial||{}) }
            : {
                ...windowDefaults(),
                ...(d
                  ? {
                      demand_id: d.id,
                      name: d.name + "运输订单",
                      cargo: d.cargo,
                      origin: d.origin,
                      destination: d.destination,
                      quantity: (d.quantity_kg - d.allocated_kg) / 1000,
                    }
                  : {}),
              }),
    );
    setDemand(d || null);
    setItems([
      {
        key: crypto.randomUUID(),
        name: (d?.name || "运输") + " · 第一批",
        quantity: d ? (d.quantity_kg - d.allocated_kg) / 1000 : undefined,
        ...windowDefaults(),
      },
    ]);
    setInvalid({});
    setError("");
    setDirty(false);
    setBusy(false);
    setResult(null);
    setReadyEditor(editor);
    if (!isDemand && !isBatch) searchDemands("", r?.demand_id);
    return () => {
      choiceSequence.current++;
      clearTimeout(choiceTimer.current);
    };
  }, [editor]);
  async function searchDemands(q = "", selectedId) {
    const n = ++choiceSequence.current;
    try {
      const r = await list("demands", { status: "已确认", q, pageSize: 50 });
      if (n !== choiceSequence.current) return;
      setChoices(r.items);
      if (selectedId) {
        const d = await detail("demands", selectedId);
        if (n === choiceSequence.current) setDemand(d);
      }
    } catch (e) {
      if (n === choiceSequence.current) setError(e.message);
    }
  }
  if (!editor || readyEditor !== editor) return null;
  const change = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setInvalid((v) => ({ ...v, [key]: undefined }));
    setDirty(true);
  };
  const chooseDemand = async (id) => {
    clearTimeout(choiceTimer.current);
    const current = ++choiceSequence.current;
    setDirty(true);
    change("demand_id", id);
    setError("");
    try {
      const d = await detail("demands", id);
      if (current !== choiceSequence.current) return;
      setDemand(d);
      setValues((v) => ({
        ...v,
        demand_id: id,
        name: v.name || d.name + "运输订单",
        cargo: d.cargo,
        origin: d.origin,
        destination: d.destination,
        quantity: (d.quantity_kg - d.allocated_kg) / 1000,
      }));
    } catch (e) {
      if (current === choiceSequence.current) setError(e.message);
    }
  };
  const close = () => {
    if (busy) return;
    if (dirty && !result && !confirm("存在未保存内容，确定放弃？")) return;
    setEditor(quick || null);
  };
  const setItem = (key, field, value) => {
    setItems((old) =>
      old.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    );
    setDirty(true);
    setInvalid((v) => ({ ...v, [key + "-" + field]: undefined }));
  };
  const total = items.reduce((n, r) => n + (Number(r.quantity) || 0), 0),
    remaining = demand
      ? (demand.quantity_kg - demand.allocated_kg) / 1000
      : null;
  function validate() {
    const errors = {};
    const requireValue = (key, value, label) => {
      if (value == null || String(value).trim() === "")
        errors[key] = "请填写" + label;
    };
    const validateOrder = (r, prefix = "") => {
      for (const [key, label] of [
        ["name", "订单名称"],
        ["quantity", "计划运量（吨）"],
        ["distance_km", "单趟距离（km）"],
        ["start_at", "计划开始时间"],
        ["finish_at", "要求完成时间"],
      ])
        requireValue(prefix + key, r[key], label);
      if (
        r.quantity != null &&
        (!Number.isFinite(Number(r.quantity)) || r.quantity <= 0)
      )
        errors[prefix + "quantity"] = "运量必须大于0";
      if (
        r.distance_km != null &&
        (r.distance_km < 0.1 || r.distance_km > 3000)
      )
        errors[prefix + "distance_km"] = "单趟距离应为0.1至3000公里";
      if (
        r.start_at &&
        r.finish_at &&
        new Date(r.finish_at) <= new Date(r.start_at)
      )
        errors[prefix + "finish_at"] = "完成时间应晚于开始时间";
    };
    if (isBatch) {
      items.forEach((r) => validateOrder(r, r.key + "-"));
      if (total > remaining)
        errors.allocation =
          "本次合计超过可分配量 " + format(remaining, 3) + " 吨";
    } else {
      for (const [key, label] of [
        ["name", isDemand ? "需求名称" : "订单名称"],
        ["cargo", "货物"],
        ["origin", "装货位置"],
        ["destination", "卸货位置"],
        ["quantity", isDemand ? "需求运量（吨）" : "计划运量（吨）"],
      ])
        requireValue(key, values[key], label);
      if (!(Number(values.quantity) > 0)) errors.quantity = "运量必须大于0";
      if (isDemand) requireValue("owner_id", values.owner_id, "归属主体");
      else {
        requireValue("demand_id", values.demand_id, "来源需求");
        validateOrder(values);
        if (confirmed) requireValue("reason", values.reason, "调整及影响说明");
      }
    }
    setInvalid(errors);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() =>
        document.getElementById("transport-" + Object.keys(errors)[0])?.focus(),
      );
      return false;
    }
    return true;
  }
  async function save(confirmValue) {
    if (busy || !validate()) return;
    setBusy(true);
    setError("");
    try {
      if (isBatch) {
        const response = await a.execute("order.generate", demand.id, {
          expected_version: demand.version,
          confirm: confirmValue,
          items: items.map(({ key, ...r }) => r),
        });
        setResult(response);
        setDirty(false);
        setDemand(response.demand);
      } else {
        const response = await a.execute(
          isDemand ? "demand.save" : "order.save",
          row?.id,
          { ...values, expected_version: row?.version, confirm: confirmValue },
        );
        setDirty(false);
        if (quick) {
          const d = response.record;
          setEditor({
            ...quick,
            values: {
              ...quick.values,
              demand_id: d.id,
              name: quick.values.name || d.name + "运输订单",
              cargo: d.cargo,
              origin: d.origin,
              destination: d.destination,
              quantity:
                quick.values.quantity ||
                (d.quantity_kg - d.allocated_kg) / 1000,
            },
            demand: d,
          });
        } else {
          setEditor(null);
          if (!isDemand && confirmValue && a.can("simulation.run"))
            a.go("simulation", { order_id: response.id });
          else a.showDetail(isDemand ? "demands" : "orders", response.id);
        }
      }
    } catch (e) {
      setError(e.message);
      if (e.code === "VERSION_CONFLICT")
        setError(e.message + "。请保留当前输入，重新打开并核对最新数据。");
    } finally {
      setBusy(false);
    }
  }
  const field = (name, label, type = "text", extra = {}) => (
    <Field
      key={name}
      name={name}
      label={label}
      type={type}
      value={values[name]}
      onChange={(v) => change(name, v)}
      error={invalid[name]}
      {...extra}
    />
  );
  const demandChoices = [
    ...(demand ? [demand] : []),
    ...choices.filter((d) => d.id !== demand?.id),
  ];
  const title = result
    ? "订单已生成"
    : isBatch
      ? "生成运输订单"
      : isDemand
        ? row
          ? "编辑运输需求"
          : quick
            ? "快捷登记需求"
            : "新建运输需求"
        : row
          ? confirmed
            ? "调整运输订单"
            : "编辑运输订单"
          : "新建运输订单";
  return (
    <Drawer
      open
      title={
        <div className="transport-drawer-title">
          {title}
          {row?.code && <span>{row.code}</span>}
        </div>
      }
      closable={false}
      extra={
        <Button
          aria-label="关闭编辑"
          type="text"
          icon={X}
          disabled={busy}
          onClick={close}
        />
      }
      onClose={close}
      keyboard={!busy}
      maskClosable={!busy}
      width="min(800px, 100vw)"
      rootClassName="transport-editor"
      destroyOnHidden
      footer={
        <div className="transport-editor-footer">
          {result ? (
            <>
              <Button onClick={() => setEditor(null)}>完成</Button>
              <Button
                type="primary"
                onClick={() => {
                  setEditor(null);
                  a.go("orders", { demand_id: demand.id });
                }}
              >
                查看订单列表
              </Button>
            </>
          ) : (
            <>
              <Button disabled={busy} onClick={close}>
                取消
              </Button>
              <div className="row">
                {!quick && (
                  <Button
                    disabled={busy}
                    loading={busy}
                    onClick={() => save(false)}
                  >
                    {isBatch ? "保存批次草稿" : row ? "保存修改" : "保存草稿"}
                  </Button>
                )}
                {(isBatch || !confirmed || (!isDemand && confirmed)) && (
                  <Button
                    type="primary"
                    disabled={busy}
                    loading={busy}
                    onClick={() => save(true)}
                  >
                    {isBatch
                      ? "确认生成订单"
                      : quick
                        ? "确认并使用"
                        : isDemand
                          ? "确认需求"
                          : confirmed
                            ? "确认调整"
                            : a.can("simulation.run")
                              ? "确认并进入推演"
                              : "确认订单"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      }
    >
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          className="transport-form-alert"
        />
      )}
      {result ? (
        <div className="stack">
          <Alert
            type="success"
            showIcon
            message={`已${result.confirmed ? "确认生成" : "保存"} ${result.orders.length} 张订单`}
          />
          <QuantitySummary demand={demand} />
          {result.orders.map((o) => (
            <div className="generated-order" key={o.id}>
              <div>
                <strong>{o.name}</strong>
                <p className="small muted">
                  {o.code} · {tonnes(o.quantity_kg)} 吨
                </p>
              </div>
              <Pill>{o.status}</Pill>
              <Button
                onClick={() => {
                  setEditor(null);
                  a.showDetail("orders", o.id);
                }}
              >
                查看
              </Button>
            </div>
          ))}
        </div>
      ) : isBatch ? (
        <>
          <QuantitySummary demand={demand} total={total} />
          <div className="allocation-route">
            <RouteCell row={demand} />
            <Pill>{demand.cargo}</Pill>
          </div>
          {invalid.allocation && (
            <Alert type="error" message={invalid.allocation} />
          )}
          <div className="batch-heading">
            <h3>运输批次</h3>
            <Button
              icon={Plus}
              size="small"
              disabled={items.length >= 20}
              onClick={() => {
                setItems((v) => [
                  ...v,
                  {
                    key: crypto.randomUUID(),
                    name: demand.name + " · 第" + (v.length + 1) + "批",
                    ...windowDefaults(),
                  },
                ]);
                setDirty(true);
              }}
            >
              增加批次
            </Button>
          </div>
          {items.map((r, i) => (
            <section className="batch-card" key={r.key}>
              <header>
                <h3>第 {i + 1} 批</h3>
                <Button
                  type="text"
                  size="small"
                  icon={Trash2}
                  disabled={items.length === 1}
                  aria-label={"移除第" + (i + 1) + "批"}
                  onClick={() => {
                    setItems((old) => old.filter((v) => v.key !== r.key));
                    setDirty(true);
                  }}
                />
              </header>
              <div className="transport-form-grid">
                {[
                  ["name", "订单名称", "text"],
                  ["quantity", "计划运量（吨）", "number"],
                  ["distance_km", "单趟距离（km）", "number"],
                  ["start_at", "计划开始时间", "datetime"],
                  ["finish_at", "要求完成时间", "datetime"],
                ].map(([name, label, type]) => (
                  <Field
                    key={name}
                    name={r.key + "-" + name}
                    label={label}
                    type={type}
                    value={r[name]}
                    onChange={(v) => setItem(r.key, name, v)}
                    error={invalid[r.key + "-" + name]}
                  />
                ))}
              </div>
            </section>
          ))}
          <div className="batch-balance">
            本次 {items.length} 批 · {format(total, 3)} 吨
            <span className={total > remaining ? "field-error" : ""}>
              分配后余量 {format(remaining - total, 3)} 吨
            </span>
          </div>
        </>
      ) : (
        <>
          {!isDemand && (
            <section className="transport-form-section">
              <h3>来源需求</h3>
              {confirmed ? (
                <div className="source-demand-label">
                  {demand?.code || a.label("demand_id", values.demand_id)}
                </div>
              ) : (
                <div className="demand-picker">
                  <Field
                    name="demand_id"
                    label="来源需求"
                    error={invalid.demand_id}
                    full
                  >
                    <Select
                      id="transport-demand_id"
                      aria-label="来源需求"
                      aria-invalid={invalid.demand_id ? true : undefined}
                      aria-describedby={
                        invalid.demand_id
                          ? "transport-error-demand_id"
                          : undefined
                      }
                      showSearch
                      filterOption={false}
                      placeholder="搜索并选择已确认需求"
                      value={values.demand_id}
                      options={demandChoices.map((d) => ({
                        value: d.id,
                        label:
                          d.code +
                          " · " +
                          d.name +
                          " · 余量 " +
                          tonnes(d.quantity_kg - d.allocated_kg) +
                          "吨",
                        disabled:
                          d.allocated_kg >= d.quantity_kg &&
                          d.id !== values.demand_id,
                      }))}
                      onSearch={(q) => {
                        clearTimeout(choiceTimer.current);
                        choiceTimer.current = setTimeout(
                          () => searchDemands(q),
                          180,
                        );
                      }}
                      onChange={chooseDemand}
                    />
                  </Field>
                  {a.can("demand.write") && (
                    <Button
                      onClick={() =>
                        setEditor({
                          kind: "demand",
                          returnTo: { ...editor, values },
                        })
                      }
                    >
                      快捷登记需求
                    </Button>
                  )}
                </div>
              )}
              {demand && <QuantitySummary demand={demand} />}
            </section>
          )}
          <section className="transport-form-section">
            <h3>基本信息</h3>
            <div className="transport-form-grid">
              {field("name", isDemand ? "需求名称" : "订单名称", "text", {
                full: true,
              })}
              {isDemand &&
                field("owner_id", "归属主体", "select", {
                  disabled: !!row,
                  options: a.boot.organizations.map((o) => ({
                    value: o.id,
                    label: o.name,
                  })),
                })}
              {field("cargo", "货物", "text", {
                disabled: isDemand && row?.allocated_kg > 0,
              })}
              {field(
                "quantity",
                isDemand ? "需求运量（吨）" : "计划运量（吨）",
                "number",
              )}
            </div>
          </section>
          <section className="transport-form-section">
            <h3>运输条件</h3>
            <div className="transport-form-grid">
              {field("origin", "装货位置", "text", {
                disabled: isDemand && row?.allocated_kg > 0,
              })}
              {field("destination", "卸货位置", "text", {
                disabled: isDemand && row?.allocated_kg > 0,
              })}
              {!isDemand && (
                <>
                  {field("distance_km", "单趟距离（km）", "number", {
                    min: 0.1,
                  })}
                  {field("start_at", "计划开始时间", "datetime")}
                  {field("finish_at", "要求完成时间", "datetime")}
                </>
              )}
            </div>
          </section>
          {confirmed && !isDemand && (
            <section className="transport-form-section">
              <h3>变更说明</h3>
              {field("reason", "调整及影响说明", "textarea", { full: true })}
              <Alert
                type="warning"
                message="保存后将失效旧方案，并取消未执行任务；已履约事实保留。"
              />
            </section>
          )}
        </>
      )}
    </Drawer>
  );
}
