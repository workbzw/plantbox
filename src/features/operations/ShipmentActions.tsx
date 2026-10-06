import { Check, ScanLine } from "lucide-react";
import { useId, useRef, useState } from "react";
import {
  useWarehouseSnapshot,
  useWarehouseSource,
  useWarehouseState,
} from "../../data/WarehouseProvider";
import type { Shipment, WarehouseCommand } from "../../domain/warehouse";
import { tr } from "../../i18n";
const nextStep: Partial<
  Record<Shipment["status"], { type: WarehouseCommand["type"]; label: string }>
> = {
  expected: { type: "arrive", label: "确认入场" },
  arrived: { type: "dock", label: "确认靠台" },
  docked: { type: "start", label: "开始装卸" },
  handling: { type: "complete", label: "完成作业" },
  completed: { type: "depart", label: "确认出场" },
};
export function ShipmentActions({
  shipment,
  terminal = false,
  onPalletSelect,
}: {
  shipment: Shipment;
  terminal?: boolean;
  onPalletSelect?: (id: string) => void;
}) {
  const scanId = useId();
  const scanInput = useRef<HTMLInputElement>(null);
  const source = useWarehouseSource(),
    snapshot = useWarehouseSnapshot(),
    { connection } = useWarehouseState();
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const retry = useRef<WarehouseCommand | null>(null),
    submitting = useRef(false);
  const manifest = snapshot.pallets.filter((p) => p.shipmentId === shipment.id);
  const step = nextStep[shipment.status];
  async function send(command: WarehouseCommand) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    retry.current = command;
    try {
      await source.execute!(command);
      retry.current = null;
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function execute(type: WarehouseCommand["type"], palletId?: string) {
    const previous = retry.current;
    const command =
      previous && previous.type === type && previous.palletId === palletId
        ? previous
        : {
            id: crypto.randomUUID(),
            type,
            shipmentId: shipment.id,
            ...(palletId ? { palletId } : {}),
          };
    void send(command);
  }
  return (
    <div className={`shipment-actions ${terminal ? "terminal-actions" : ""}`}>
      {shipment.status === "handling" && (
        <form
          className="pallet-scan"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) execute("confirm_pallet", code.trim());
          }}
        >
          <label htmlFor={scanId}>
            {terminal && <ScanLine size={15} />} {tr("输入或扫描托盘编号")}
          </label>
          <div>
            <input
              id={scanId}
              ref={scanInput}
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy || connection !== "connected"}
              placeholder={
                manifest.find((p) => !p.confirmed)?.id ?? tr("托盘编号")
              }
            />
            <button
              className="primary-button"
              type="submit"
              disabled={busy || !code.trim() || connection !== "connected"}
            >
              {tr("确认托盘")}
            </button>
          </div>
        </form>
      )}
      {step && (
        <button
          className="primary-button full"
          disabled={
            busy ||
            connection !== "connected" ||
            (step.type === "complete" && shipment.completed !== shipment.total)
          }
          onClick={() => execute(step.type)}
        >
          {tr(busy ? "正在提交" : step.label)}
        </button>
      )}
      {terminal &&
        shipment.status === "handling" &&
        shipment.completed < shipment.total && (
          <p className="terminal-remaining">
            {tr("还需确认 {0} 托盘", {
              0: shipment.total - shipment.completed,
            })}
          </p>
        )}
      {terminal && shipment.status === "departed" && (
        <div className="terminal-complete">
          <Check size={17} />
          {tr("全部托盘已确认，车辆已出场")}
        </div>
      )}
      {error && (
        <div className="command-error" role="alert">
          <p>{tr(error)}</p>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (retry.current) void send(retry.current);
            }}
          >
            {tr("重试上次提交")}
          </button>
        </div>
      )}
      <details className="pallet-manifest">
        <summary>
          {tr("托盘清单")} · {manifest.length}
        </summary>
        <ul>
          {manifest.map((p) => (
            <li key={p.id}>
              <div>
                {terminal && shipment.status === "handling" && !p.confirmed ? (
                  <button
                    type="button"
                    className="manifest-fill"
                    disabled={busy || connection !== "connected"}
                    aria-label={tr("填入托盘 {0}", { 0: p.id })}
                    onClick={() => {
                      setCode(p.id);
                      onPalletSelect?.(p.id);
                      scanInput.current?.focus();
                    }}
                  >
                    <code>{p.id}</code>
                    <ScanLine size={12} />
                  </button>
                ) : (
                  <code>{p.id}</code>
                )}
                <small>
                  {p.skuId} · {p.quantity} · {p.batch}
                </small>
              </div>
              <span>{tr(p.confirmed ? "已确认" : "待确认")}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
