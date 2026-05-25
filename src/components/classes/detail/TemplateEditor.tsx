import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { TemplateFile } from "../../../classes/model";
import { compareValue, type Drift } from "../../../lib/drift";
import { toggleStringSetMember, useStringSetMember } from "../../../lib/uiPrefs";
import { DriftMarker } from "../../Drift";
import { HelpIcon, Tooltip } from "../../Tooltip";
import { templateHelpFor } from "./templateHelp";

const TEMPLATE_SUBBLOCKS_KEY = "classes.templateSubBlocks";

const INPUT =
    "mono rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--color-accent-2)]";
const LBL = "text-[10px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]";

function FieldLabel({ tag, label, className }: { tag: string; label?: string; className?: string }) {
    const help = templateHelpFor(tag);
    return (
        <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
            <span>{label ?? tag}</span>
            {help && (
                <Tooltip content={<span className="text-[11px] normal-case tracking-normal">{help}</span>}>
                    <HelpIcon />
                </Tooltip>
            )}
        </span>
    );
}

export function ClassTemplateEditor({
    template,
    mutate,
    clientStats
}: {
    template: TemplateFile | null;
    mutate: (path: string, fn: () => void) => void;
    clientStats?: ReadonlyMap<string, number>;
}) {
    const [rev, setRev] = useState(0);
    const relPath = template?.relPath ?? "";
    const openStatic = useStringSetMember(TEMPLATE_SUBBLOCKS_KEY, `${relPath}:static`);
    const openLvls = useStringSetMember(TEMPLATE_SUBBLOCKS_KEY, `${relPath}:lvls`);
    if (!template) {
        return (
            <div className="px-1 py-1 text-[11px] text-[var(--color-text-faint)]">
                No template file under <span className="mono">stats/players/templates/</span> has a matching{" "}
                <span className="mono">&lt;classId&gt;</span>.
            </div>
        );
    }
    const m = (fn: () => void) => {
        mutate(template.path, fn);
        setRev((r) => r + 1);
    };
    void rev;

    const levelCount = template.lvlUpgain
        ? Array.from(template.lvlUpgain.children).filter((c) => c.tagName === "level").length
        : 0;

    return (
        <div className="space-y-2">
            <div className="text-[10px] text-[var(--color-text-faint)]">
                <span className="mono">templates/{template.relPath}</span>
            </div>

            <SubBlock
                title="Base stats (staticData)"
                open={openStatic}
                onToggle={() => toggleStringSetMember(TEMPLATE_SUBBLOCKS_KEY, `${template.relPath}:static`)}
            >
                {!template.staticData ? (
                    <div className="px-1 text-[11px] text-[var(--color-text-faint)]">
                        no &lt;staticData&gt; in this file
                    </div>
                ) : Array.from(template.staticData.children).length === 0 ? (
                    <div className="px-1 text-[11px] text-[var(--color-text-faint)]">(empty)</div>
                ) : (
                    <div className="space-y-1">
                        {Array.from(template.staticData.children).map((c, i) => (
                            <StaticNode
                                key={`${c.tagName}-${i}`}
                                el={c}
                                depth={0}
                                mutate={m}
                                clientStats={clientStats}
                            />
                        ))}
                    </div>
                )}
            </SubBlock>

            <SubBlock
                title={`Level-up table (${levelCount} level${levelCount === 1 ? "" : "s"})`}
                open={openLvls}
                onToggle={() => toggleStringSetMember(TEMPLATE_SUBBLOCKS_KEY, `${template.relPath}:lvls`)}
            >
                {!template.lvlUpgain || levelCount === 0 ? (
                    <div className="px-1 text-[11px] text-[var(--color-text-faint)]">
                        no &lt;lvlUpgainData&gt; in this file
                    </div>
                ) : (
                    <LvlTable el={template.lvlUpgain} mutate={m} />
                )}
            </SubBlock>
        </div>
    );
}

function SubBlock({
    title,
    open,
    onToggle,
    children
}: {
    title: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded border border-[var(--color-border)]/60 bg-[var(--color-surface-2)]/30">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
            >
                {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
                {title}
            </button>
            {open && <div className="border-t border-[var(--color-border)]/40 p-2">{children}</div>}
        </div>
    );
}

function StaticNode({
    el,
    depth,
    mutate,
    clientStats
}: {
    el: Element;
    depth: number;
    mutate: (fn: () => void) => void;
    clientStats?: ReadonlyMap<string, number>;
}) {
    const childEls = Array.from(el.children);
    const pad = { paddingLeft: depth ? depth * 14 : 0 };

    if (childEls.length > 0) {
        return (
            <div style={pad}>
                <div className="mt-0.5">
                    <FieldLabel tag={el.tagName} className={LBL} />
                </div>
                <div className="space-y-1">
                    {childEls.map((c, i) => (
                        <StaticNode
                            key={`${c.tagName}-${i}`}
                            el={c}
                            depth={depth + 1}
                            mutate={mutate}
                            clientStats={clientStats}
                        />
                    ))}
                </div>
            </div>
        );
    }

    const attrs = Array.from(el.attributes);
    if (attrs.length > 0) {
        return (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={pad}>
                <FieldLabel tag={el.tagName} className={`${LBL} w-44 shrink-0`} />
                {attrs.map((a) => (
                    <label key={a.name} className="flex items-center gap-1 text-[11px]">
                        <span className="text-[var(--color-text-faint)]">{a.name}</span>
                        <input
                            className={`${INPUT} w-20`}
                            defaultValue={a.value}
                            onBlur={(e) => {
                                if (e.target.value !== a.value) mutate(() => el.setAttribute(a.name, e.target.value));
                            }}
                        />
                    </label>
                ))}
            </div>
        );
    }

    const text = (el.textContent ?? "").trim();
    const clientVal = clientStats?.get(el.tagName);
    const driftField =
        clientVal != null && Number(text) !== clientVal
            ? compareValue({ label: el.tagName, server: Number(text), client: clientVal })
            : null;
    const drift: Drift | null = driftField
        ? { clientSource: "ClassInfo.dat", fields: [driftField] }
        : null;
    return (
        <div className="flex items-center gap-3" style={pad}>
            <FieldLabel tag={el.tagName} className={`${LBL} w-44 shrink-0`} />
            <input
                className={`${INPUT} w-32`}
                defaultValue={text}
                onBlur={(e) => {
                    if (e.target.value.trim() !== text)
                        mutate(() => {
                            el.textContent = e.target.value;
                        });
                }}
            />
            {drift && <DriftMarker drift={drift} />}
        </div>
    );
}

function LvlTable({ el, mutate }: { el: Element; mutate: (fn: () => void) => void }) {
    const levels = Array.from(el.children).filter((c) => c.tagName === "level");
    const cols: string[] = [];
    for (const lv of levels) {
        for (const c of Array.from(lv.children)) if (!cols.includes(c.tagName)) cols.push(c.tagName);
    }
    return (
        <div className="max-h-[420px] overflow-auto rounded border border-[var(--color-border)]/40">
            <table className="w-full border-collapse text-[11px]">
                <thead className="sticky top-0 bg-[var(--color-surface-2)]">
                    <tr>
                        <th className="px-2 py-1 text-left text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]">
                            <FieldLabel tag="level" label="lvl" />
                        </th>
                        {cols.map((c) => (
                            <th
                                key={c}
                                className="px-2 py-1 text-left text-[9px] uppercase tracking-[0.15em] text-[var(--color-text-faint)]"
                            >
                                <FieldLabel tag={c} />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {levels.map((lv, i) => {
                        const valAttr = lv.getAttribute("val") ?? String(i + 1);
                        return (
                            <tr key={valAttr} className="border-t border-[var(--color-border)]/30">
                                <td className="mono px-2 py-0.5 text-[var(--color-accent-2)]">{valAttr}</td>
                                {cols.map((col) => {
                                    const cell = Array.from(lv.children).find((c) => c.tagName === col) ?? null;
                                    const text = (cell?.textContent ?? "").trim();
                                    return (
                                        <td key={col} className="px-1 py-0.5">
                                            <input
                                                className="mono w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] outline-none hover:border-[var(--color-border)] focus:border-[var(--color-accent-2)] focus:bg-[var(--color-surface)]"
                                                defaultValue={text}
                                                onBlur={(e) => {
                                                    const v = e.target.value;
                                                    if (v.trim() === text) return;
                                                    mutate(() => {
                                                        let target = cell;
                                                        if (!target) {
                                                            target = lv.ownerDocument.createElement(col);
                                                            lv.appendChild(target);
                                                        }
                                                        target.textContent = v;
                                                    });
                                                }}
                                            />
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
