import {
  ChevronDown,
  CircleHelp,
  Crosshair,
  Map,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import { fmt } from "../../components/format";
import { Status } from "../../components/ui";
import { SITE } from "../../config/site";
import {
  useWarehouseSnapshot,
  useWarehouseSource,
} from "../../data/WarehouseProvider";
import { displayInventory, displayTime } from "../../data/presentation";
import { tr } from "../../i18n";
import { useUIStore as useStore } from "../../state/uiStore";
import "../../styles.css";
export function InventoryPage() {
  const snapshot = useWarehouseSnapshot();
  const source = useWarehouseSource();
  const [query, setQuery] = useState(""),
    [onlyLow, setOnlyLow] = useState(false);
  const rows = snapshot.inventory.map(displayInventory),
    filtered = rows.filter(
      (s) =>
        (!onlyLow || s.low) &&
        `${s.id}${s.name}${s.category}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  return (
    <div className="data-page">
      <div className="data-title">
        <div>
          <span className="eyebrow">INVENTORY MANAGEMENT</span>
          <h1>{tr("库存管理")}</h1>
          <p>
            {tr(SITE.name)}
            <span> / </span>
            {tr("每一次流转，都清晰可见")}
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={() => useStore.getState().setPage("scene")}
        >
          <Map size={16} />
          {tr("返回园区")}
        </button>
      </div>
      <div className="data-stats">
        <div>
          <span>{tr("商品种类")}</span>
          <strong>
            {rows.length}
            <small>SKU</small>
          </strong>
        </div>
        <div>
          <span>{tr("实物库存")}</span>
          <strong>
            {fmt(rows.reduce((a, r) => a + r.stock, 0))}
            <small>{tr("件 / 个 / 卷")}</small>
          </strong>
        </div>
        <div>
          <span>{tr("已预留")}</span>
          <strong>
            {fmt(rows.reduce((a, r) => a + r.reserved, 0))}
            <small>{tr("待出库")}</small>
          </strong>
        </div>
        <div>
          <span>{tr("库存预警")}</span>
          <strong className="orange-text">
            {rows.filter((s) => s.low).length}
            <small>{tr("项待关注")}</small>
          </strong>
        </div>
      </div>
      <div className="table-panel">
        <div className="table-toolbar">
          <div className="table-search">
            <Search size={17} />
            <input
              aria-label={tr("搜索库存")}
              placeholder={tr("搜索商品名称、SKU 或分类")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            className={`filter-button ${onlyLow ? "active" : ""}`}
            onClick={() => setOnlyLow(!onlyLow)}
          >
            <SlidersHorizontal size={15} />
            {onlyLow ? tr("仅显示库存预警") : tr("全部库存")}
            <ChevronDown size={13} />
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{tr("商品 / SKU")}</th>
                <th>{tr("存放库位")}</th>
                <th>{tr("实物库存")}</th>
                <th>{tr("已预留")}</th>
                <th>{tr("可用库存")}</th>
                <th>{tr("库存状态")}</th>
                <th>{tr("操作")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="product-cell">
                      <span style={{ color: r.color }}>
                        <Package size={24} />
                      </span>
                      <div>
                        <strong>{r.name}</strong>
                        <small>
                          {r.id} · {r.category}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="location-tag">{r.location}</span>
                  </td>
                  <td className="number">{fmt(r.stock)}</td>
                  <td className="number muted">{fmt(r.reserved)}</td>
                  <td className="number">
                    <strong>{fmt(r.available)}</strong>
                  </td>
                  <td>
                    <Status tone={r.low ? "orange" : "green"}>
                      {r.low ? tr("库存偏低") : tr("库存充足")}
                    </Status>
                  </td>
                  <td>
                    {r.low && source.replenish ? (
                      <button
                        className="text-button"
                        onClick={() => source.replenish?.(r.id, r.pallet * 6)}
                      >
                        {tr("模拟补货")}
                        <Plus size={13} />
                      </button>
                    ) : (
                      <button
                        className="text-button"
                        onClick={() => {
                          useStore.getState().setPage("scene");
                          useStore.getState().setCamera("interior");
                        }}
                      >
                        {tr("查看库区")}
                        <Crosshair size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="empty-state">
              <Search size={28} />
              <strong>{tr("没有找到匹配的商品")}</strong>
              <span>{tr("试试其他名称，或切换为全部库存。")}</span>
            </div>
          )}
        </div>
        <div className="table-footer">
          <span>
            {tr("共")}
            {filtered.length}
            {tr("项商品")}
          </span>
          <span>
            <span className="small-dot blue" />
            {tr("更新于")}
            {displayTime(snapshot.updatedAt)}
          </span>
        </div>
      </div>
      <div className="data-note">
        <CircleHelp size={15} />
        {tr(
          snapshot.mode === "demo"
            ? "可用库存 = 实物库存 − 已预留。数据来自园区作业模拟，补货仅影响本次演示。"
            : "可用库存 = 实物库存 − 已预留。库存由后台确认的托盘交付更新。",
        )}
      </div>
    </div>
  );
}
