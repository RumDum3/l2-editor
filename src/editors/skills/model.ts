export type FieldValue =
    | { kind: "single"; value: string }
    | { kind: "perLevel"; values: Map<number, string> }
    | {
          kind: "perSublevel";
          base: Map<number, string>;
          overrides: Map<number, Map<number, string>>;
      };

export type ItemList = { tag: string; childTag: string; items: string[]; el: Element };

export type SkillItem = {
    kind: "effect" | "condition";
    handler: string;
    el: Element;
    params: { tag: string; value: FieldValue }[];
    lists: ItemList[];
    blocks: { tag: string; el: Element }[];
};

export type SkillGroup = {
    scope: string;
    el: Element;
    items: SkillItem[];
};

export type CondLeaf =
    | { kind: "handler"; item: SkillItem }
    | { kind: "check"; tag: string; el: Element; attrs: { name: string; value: string }[] }
    | { kind: "raw"; tag: string; el: Element };

export type ConditionGroup = {
    scope: string;
    el: Element;
    msgId: string;
    op: "and" | "or" | "not";
    opEl: Element;
    leaves: CondLeaf[];
};

export const EFFECT_SCOPES = [
    "effects",
    "startEffects",
    "selfEffects",
    "channelingEffects",
    "pvpEffects",
    "pveEffects",
    "endEffects"
] as const;
export const CONDITION_SCOPES = ["conditions", "targetConditions", "passiveConditions"] as const;
export type EffectScope = (typeof EFFECT_SCOPES)[number];
export type ConditionScope = (typeof CONDITION_SCOPES)[number];

export type SkillVariable = { name: string; val: string; el: Element };

export type AttachSkillRow = {
    requiredSkillId: string;
    requiredSkillLevel: string;
    skillId: string;
    skillLevel: string;
    el: Element;
};

export type Skill = {
    el: Element;
    id: number;
    name: string;
    toLevel: number;
    fields: { tag: string; value: FieldValue }[];
    variables: SkillVariable[];
    attachSkills: AttachSkillRow[];
    effectGroups: SkillGroup[];
    conditionGroups: ConditionGroup[];
    blocks: { tag: string; el: Element }[];
};

export function parseSkillList(doc: XMLDocument): Skill[] {
    const out: Skill[] = [];
    const list = doc.documentElement;
    if (!list || list.tagName !== "list") return out;
    for (let i = 0; i < list.children.length; i++) {
        const el = list.children[i];
        if (el.tagName !== "skill") continue;
        out.push(parseSkill(el));
    }
    return out;
}

function classifyChild(child: Element): {
    field?: { tag: string; value: FieldValue };
    block?: { tag: string; el: Element };
} {
    const tag = child.tagName;
    if (tag === "variable") {
        return { block: { tag, el: child } };
    }
    const elKids = Array.from(child.children);
    if (elKids.length === 0) {
        return { field: { tag, value: { kind: "single", value: child.textContent?.trim() ?? "" } } };
    }
    if (!elKids.every((k) => k.tagName === "value")) {
        return { block: { tag, el: child } };
    }
    const base = new Map<number, string>();
    const overrides = new Map<number, Map<number, string>>();
    for (const v of elKids) {
        const lvl = Number(v.getAttribute("level") ?? "0");
        if (!Number.isFinite(lvl) || lvl <= 0) continue;
        const sub = Number(v.getAttribute("subLevel") ?? "0");
        const text = v.textContent?.trim() ?? "";
        if (Number.isFinite(sub) && sub > 0) {
            let inner = overrides.get(lvl);
            if (!inner) {
                inner = new Map<number, string>();
                overrides.set(lvl, inner);
            }
            inner.set(sub, text);
        } else {
            base.set(lvl, text);
        }
    }
    if (overrides.size > 0) return { field: { tag, value: { kind: "perSublevel", base, overrides } } };
    return { field: { tag, value: { kind: "perLevel", values: base } } };
}

function parseItemChildren(itemEl: Element): Pick<SkillItem, "params" | "lists" | "blocks"> {
    const params: SkillItem["params"] = [];
    const lists: SkillItem["lists"] = [];
    const blocks: SkillItem["blocks"] = [];
    for (let j = 0; j < itemEl.children.length; j++) {
        const c = classifyChild(itemEl.children[j]);
        if (c.field) {
            params.push(c.field);
            continue;
        }
        if (!c.block) continue;
        const kids = Array.from(c.block.el.children);
        const isList =
            kids.length > 0 &&
            kids.every(
                (k) =>
                    k.tagName === kids[0].tagName &&
                    k.children.length === 0 &&
                    k.attributes.length === 0 &&
                    (k.textContent?.trim() ?? "") !== ""
            );
        if (isList) {
            lists.push({
                tag: c.block.tag,
                childTag: kids[0].tagName,
                items: kids.map((k) => k.textContent?.trim() ?? ""),
                el: c.block.el
            });
        } else {
            blocks.push(c.block);
        }
    }
    return { params, lists, blocks };
}

function parseGroup(wrapperEl: Element, kind: "effect"): { group: SkillGroup; complex: boolean } {
    const items: SkillItem[] = [];
    let complex = false;
    for (let i = 0; i < wrapperEl.children.length; i++) {
        const child = wrapperEl.children[i];
        if (child.tagName !== kind) {
            complex = true;
            continue;
        }
        items.push({ kind, handler: child.getAttribute("name") ?? "", el: child, ...parseItemChildren(child) });
    }
    return { group: { scope: wrapperEl.tagName, el: wrapperEl, items }, complex };
}

const LOGIC_TAGS = ["and", "or", "not"] as const;

function parseCondLeaf(el: Element): CondLeaf {
    if (el.tagName === "condition") {
        return {
            kind: "handler",
            item: { kind: "condition", handler: el.getAttribute("name") ?? "", el, ...parseItemChildren(el) }
        };
    }
    if (el.children.length === 0) {
        return {
            kind: "check",
            tag: el.tagName,
            el,
            attrs: Array.from(el.attributes).map((a) => ({ name: a.name, value: a.value }))
        };
    }
    return { kind: "raw", tag: el.tagName, el };
}

function parseConditionGroup(wrapperEl: Element): ConditionGroup {
    const directKids = Array.from(wrapperEl.children);
    let op: "and" | "or" | "not" = "and";
    let opEl: Element = wrapperEl;
    let leafEls = directKids;
    if (directKids.length === 1 && (LOGIC_TAGS as readonly string[]).includes(directKids[0].tagName)) {
        op = directKids[0].tagName as "and" | "or" | "not";
        opEl = directKids[0];
        leafEls = Array.from(opEl.children);
    }
    return {
        scope: wrapperEl.tagName,
        el: wrapperEl,
        msgId: wrapperEl.getAttribute("msgId") ?? "",
        op,
        opEl,
        leaves: leafEls.map(parseCondLeaf)
    };
}

export function parseSkill(el: Element): Skill {
    const id = Number(el.getAttribute("id") ?? "0");
    const name = el.getAttribute("name") ?? "";
    const toLevel = Number(el.getAttribute("toLevel") ?? "1");

    const fields: Skill["fields"] = [];
    const variables: SkillVariable[] = [];
    const attachSkills: AttachSkillRow[] = [];
    const blocks: Skill["blocks"] = [];
    const effectGroups: SkillGroup[] = [];
    const conditionGroups: ConditionGroup[] = [];

    for (let i = 0; i < el.children.length; i++) {
        const child = el.children[i];
        const tag = child.tagName;
        if (tag === "variable") {
            variables.push({
                name: child.getAttribute("name") ?? "",
                val: child.getAttribute("val") ?? "",
                el: child
            });
            continue;
        }
        if (tag === "attachSkillList") {
            const itemEls = Array.from(child.children);
            if (itemEls.length > 0 && itemEls.every((it) => it.tagName === "item")) {
                for (const it of itemEls) {
                    const sub = (n: string) =>
                        Array.from(it.children)
                            .find((c) => c.tagName === n)
                            ?.textContent?.trim() ?? "";
                    attachSkills.push({
                        requiredSkillId: sub("requiredSkillId"),
                        requiredSkillLevel: sub("requiredSkillLevel"),
                        skillId: sub("skillId"),
                        skillLevel: sub("skillLevel"),
                        el: it
                    });
                }
            } else {
                blocks.push({ tag, el: child });
            }
            continue;
        }
        if ((EFFECT_SCOPES as readonly string[]).includes(tag)) {
            const { group, complex } = parseGroup(child, "effect");
            if (complex) blocks.push({ tag, el: child });
            else effectGroups.push(group);
            continue;
        }
        if ((CONDITION_SCOPES as readonly string[]).includes(tag)) {
            conditionGroups.push(parseConditionGroup(child));
            continue;
        }
        const c = classifyChild(child);
        if (c.field) fields.push(c.field);
        else if (c.block) blocks.push(c.block);
    }

    return { el, id, name, toLevel, fields, variables, attachSkills, effectGroups, conditionGroups, blocks };
}

export function setSingleField(skill: Skill, tag: string, value: string): void {
    let el = skill.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (!el) {
        el = skill.el.ownerDocument.createElement(tag);
        const firstBlock = Array.from(skill.el.children).find(
            (c) => c.tagName === "conditions" || c.tagName === "effects"
        );
        skill.el.insertBefore(el, firstBlock ?? null);
    }
    el.textContent = value;
    const found = skill.fields.find((f) => f.tag === tag);
    if (found) found.value = { kind: "single", value };
    else skill.fields.push({ tag, value: { kind: "single", value } });
}

export function setFieldAsPerLevel(skill: Skill, tag: string, levels: Map<number, string>): void {
    let el = skill.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (!el) {
        el = skill.el.ownerDocument.createElement(tag);
        const firstBlock = Array.from(skill.el.children).find(
            (c) => c.tagName === "conditions" || c.tagName === "effects"
        );
        skill.el.insertBefore(el, firstBlock ?? null);
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    const sorted = [...levels.entries()].sort((a, b) => a[0] - b[0]);
    for (const [lvl, v] of sorted) {
        const valEl = skill.el.ownerDocument.createElement("value");
        valEl.setAttribute("level", String(lvl));
        valEl.textContent = v;
        el.appendChild(valEl);
    }
    const newValue: FieldValue = { kind: "perLevel", values: new Map(levels) };
    const found = skill.fields.find((f) => f.tag === tag);
    if (found) found.value = newValue;
    else skill.fields.push({ tag, value: newValue });
}

export type RootAttr = "id" | "name" | "toLevel" | "subLevel" | "referenceId" | "displayId" | "displayLevel";

export function rootAttrDefault(skill: Skill, name: RootAttr): string | null {
    switch (name) {
        case "subLevel":
        case "referenceId":
            return "0";
        case "displayId":
            return String(skill.id);
        case "displayLevel":
            return null;
        default:
            return null;
    }
}

export function setRootAttr(skill: Skill, name: RootAttr, value: string): void {
    if (name === "id" || name === "name" || name === "toLevel") {
        skill.el.setAttribute(name, value);
        if (name === "id") skill.id = Number(value);
        if (name === "name") skill.name = value;
        if (name === "toLevel") skill.toLevel = Number(value);
        return;
    }
    const trimmed = value.trim();
    const def = rootAttrDefault(skill, name);
    if (trimmed === "" || (def !== null && trimmed === def)) {
        skill.el.removeAttribute(name);
    } else {
        skill.el.setAttribute(name, trimmed);
    }
}

export function removeSingleField(skill: Skill, tag: string): void {
    const el = skill.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (el) el.remove();
    const idx = skill.fields.findIndex((f) => f.tag === tag);
    if (idx >= 0) skill.fields.splice(idx, 1);
}

export function setPerLevelValue(skill: Skill, tag: string, level: number, value: string): void {
    const field = skill.fields.find((f) => f.tag === tag);
    if (!field || field.value.kind !== "perLevel") return;
    let parent = skill.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (!parent) {
        parent = skill.el.ownerDocument.createElement(tag);
        const firstBlock = Array.from(skill.el.children).find(
            (c) => c.tagName === "conditions" || c.tagName === "effects"
        );
        skill.el.insertBefore(parent, firstBlock ?? null);
    }
    let valueEl = Array.from(parent.children).find(
        (c) => c.tagName === "value" && Number(c.getAttribute("level") ?? "0") === level
    );
    if (!valueEl) {
        valueEl = skill.el.ownerDocument.createElement("value");
        valueEl.setAttribute("level", String(level));
        const after = Array.from(parent.children).find(
            (c) => c.tagName === "value" && Number(c.getAttribute("level") ?? "0") > level
        );
        parent.insertBefore(valueEl, after ?? null);
    }
    valueEl.textContent = value;
    field.value.values.set(level, value);
}

export function deletePerLevelValue(skill: Skill, tag: string, level: number): void {
    const field = skill.fields.find((f) => f.tag === tag);
    if (!field || field.value.kind !== "perLevel") return;
    const parent = skill.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (!parent) return;
    const valueEl = Array.from(parent.children).find(
        (c) => c.tagName === "value" && Number(c.getAttribute("level") ?? "0") === level
    );
    if (valueEl) parent.removeChild(valueEl);
    field.value.values.delete(level);
}

export function valueAtLevelSublevel(field: FieldValue, level: number, sublevel: number): string {
    if (field.kind === "single") return field.value;
    if (field.kind === "perLevel") {
        return resolvePerLevel(field.values, level);
    }
    if (sublevel > 0) {
        const inner = field.overrides.get(level);
        if (inner) {
            const v = inner.get(sublevel);
            if (v !== undefined) return v;
        }
    }
    return resolvePerLevel(field.base, level);
}

function resolvePerLevel(values: Map<number, string>, level: number): string {
    const sorted = [...values.entries()].sort((a, b) => a[0] - b[0]);
    let current = "";
    for (const [lvl, v] of sorted) {
        if (lvl > level) break;
        current = v;
    }
    return current;
}

export function setSublevelValue(skill: Skill, tag: string, level: number, sublevel: number, value: string): void {
    if (sublevel <= 0) {
        setPerLevelValue(skill, tag, level, value);
        return;
    }

    const field = skill.fields.find((f) => f.tag === tag);
    let parent = skill.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (!parent) {
        parent = skill.el.ownerDocument.createElement(tag);
        const firstBlock = Array.from(skill.el.children).find(
            (c) => c.tagName === "conditions" || c.tagName === "effects"
        );
        skill.el.insertBefore(parent, firstBlock ?? null);
    }

    let valueEl: Element | undefined = Array.from(parent.children).find((c) => {
        if (c.tagName !== "value") return false;
        return (
            Number(c.getAttribute("level") ?? "0") === level && Number(c.getAttribute("subLevel") ?? "0") === sublevel
        );
    });
    if (!valueEl) {
        valueEl = skill.el.ownerDocument.createElement("value");
        valueEl.setAttribute("level", String(level));
        valueEl.setAttribute("subLevel", String(sublevel));
        const after = Array.from(parent.children).find((c) => {
            if (c.tagName !== "value") return false;
            const lvl = Number(c.getAttribute("level") ?? "0");
            const sub = Number(c.getAttribute("subLevel") ?? "0");
            return lvl > level || (lvl === level && sub > sublevel);
        });
        parent.insertBefore(valueEl, after ?? null);
    }
    valueEl.textContent = value;

    if (!field) {
        const base = new Map<number, string>();
        const overrides = new Map<number, Map<number, string>>();
        overrides.set(level, new Map([[sublevel, value]]));
        skill.fields.push({ tag, value: { kind: "perSublevel", base, overrides } });
        return;
    }
    if (field.value.kind === "single") {
        const base = new Map<number, string>();
        if (field.value.value !== "") base.set(1, field.value.value);
        const overrides = new Map<number, Map<number, string>>();
        overrides.set(level, new Map([[sublevel, value]]));
        field.value = { kind: "perSublevel", base, overrides };
        return;
    }
    if (field.value.kind === "perLevel") {
        const base = new Map(field.value.values);
        const overrides = new Map<number, Map<number, string>>();
        overrides.set(level, new Map([[sublevel, value]]));
        field.value = { kind: "perSublevel", base, overrides };
        return;
    }
    let inner = field.value.overrides.get(level);
    if (!inner) {
        inner = new Map<number, string>();
        field.value.overrides.set(level, inner);
    }
    inner.set(sublevel, value);
}

export function deleteSublevelValue(skill: Skill, tag: string, level: number, sublevel: number): void {
    if (sublevel <= 0) {
        deletePerLevelValue(skill, tag, level);
        return;
    }
    const field = skill.fields.find((f) => f.tag === tag);
    if (!field || field.value.kind !== "perSublevel") return;
    const parent = skill.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (parent) {
        const valueEl = Array.from(parent.children).find(
            (c) =>
                c.tagName === "value" &&
                Number(c.getAttribute("level") ?? "0") === level &&
                Number(c.getAttribute("subLevel") ?? "0") === sublevel
        );
        if (valueEl) parent.removeChild(valueEl);
    }
    const inner = field.value.overrides.get(level);
    if (inner) {
        inner.delete(sublevel);
        if (inner.size === 0) field.value.overrides.delete(level);
    }
    if (field.value.overrides.size === 0) {
        field.value = { kind: "perLevel", values: field.value.base };
    }
}

function cssEscape(s: string): string {
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

export function setItemSingleParam(item: SkillItem, tag: string, value: string): void {
    let el = item.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (!el) {
        el = item.el.ownerDocument.createElement(tag);
        item.el.appendChild(el);
    }
    while (el.firstChild && el.firstChild.nodeType !== 3) {
        el.removeChild(el.firstChild);
    }
    el.textContent = value;
    const found = item.params.find((p) => p.tag === tag);
    if (found) found.value = { kind: "single", value };
    else item.params.push({ tag, value: { kind: "single", value } });
}

export function removeItemParam(item: SkillItem, tag: string): void {
    const el = item.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (el) el.remove();
    const pi = item.params.findIndex((p) => p.tag === tag);
    if (pi >= 0) item.params.splice(pi, 1);
    const li = item.lists.findIndex((l) => l.tag === tag);
    if (li >= 0) item.lists.splice(li, 1);
    const bi = item.blocks.findIndex((b) => b.tag === tag);
    if (bi >= 0) item.blocks.splice(bi, 1);
}

export function setItemList(item: SkillItem, tag: string, childTag: string, items: string[]): void {
    let el = item.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (!el) {
        el = item.el.ownerDocument.createElement(tag);
        item.el.appendChild(el);
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    for (const v of items) {
        const c = item.el.ownerDocument.createElement(childTag);
        c.textContent = v;
        el.appendChild(c);
    }
    const found = item.lists.find((l) => l.tag === tag);
    if (found) {
        found.childTag = childTag;
        found.items = [...items];
        found.el = el;
    } else {
        item.lists.push({ tag, childTag, items: [...items], el });
    }
}

export function addSkillVariable(skill: Skill): void {
    let n = 1;
    while (skill.variables.some((v) => v.name === `var${n}`)) n++;
    const name = `var${n}`;
    const el = skill.el.ownerDocument.createElement("variable");
    el.setAttribute("name", name);
    el.setAttribute("val", "0");
    const lastVar = skill.variables.length > 0 ? skill.variables[skill.variables.length - 1].el : null;
    if (lastVar) {
        lastVar.after(el);
    } else {
        skill.el.insertBefore(el, skill.el.firstElementChild);
    }
    skill.variables.push({ name, val: "0", el });
}

export function setSkillVariableAt(skill: Skill, index: number, name: string, val: string): void {
    const v = skill.variables[index];
    if (!v) return;
    v.el.setAttribute("name", name);
    v.el.setAttribute("val", val);
    v.name = name;
    v.val = val;
}

export function removeSkillVariableAt(skill: Skill, index: number): void {
    const v = skill.variables[index];
    if (!v) return;
    v.el.remove();
    skill.variables.splice(index, 1);
}

type AttachField = "requiredSkillId" | "requiredSkillLevel" | "skillId" | "skillLevel";

function setAttachSub(item: Element, tag: string, value: string): void {
    const trimmed = value.trim();
    let el = Array.from(item.children).find((c) => c.tagName === tag) ?? null;
    if (trimmed === "") {
        if (el) el.remove();
        return;
    }
    if (!el) {
        el = item.ownerDocument.createElement(tag);
        item.appendChild(el);
    }
    el.textContent = trimmed;
}

export function addAttachSkill(skill: Skill): void {
    let wrapper = Array.from(skill.el.children).find((c) => c.tagName === "attachSkillList") ?? null;
    if (!wrapper) {
        wrapper = skill.el.ownerDocument.createElement("attachSkillList");
        skill.el.appendChild(wrapper);
    }
    const item = skill.el.ownerDocument.createElement("item");
    wrapper.appendChild(item);
    skill.attachSkills.push({ requiredSkillId: "", requiredSkillLevel: "", skillId: "", skillLevel: "", el: item });
}

export function setAttachSkillAt(skill: Skill, index: number, field: AttachField, value: string): void {
    const row = skill.attachSkills[index];
    if (!row) return;
    setAttachSub(row.el, field, value);
    row[field] = value.trim();
}

export function removeAttachSkillAt(skill: Skill, index: number): void {
    const row = skill.attachSkills[index];
    if (!row) return;
    const wrapper = row.el.parentElement;
    row.el.remove();
    skill.attachSkills.splice(index, 1);
    if (wrapper && wrapper.tagName === "attachSkillList" && wrapper.children.length === 0) {
        wrapper.remove();
    }
}

export function promoteItemParamToPerLevel(item: SkillItem, tag: string): void {
    const param = item.params.find((p) => p.tag === tag);
    if (!param || param.value.kind !== "single") return;
    const v = param.value.value;
    let el = item.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (!el) {
        el = item.el.ownerDocument.createElement(tag);
        item.el.appendChild(el);
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    const valEl = item.el.ownerDocument.createElement("value");
    valEl.setAttribute("level", "1");
    valEl.textContent = v;
    el.appendChild(valEl);
    param.value = { kind: "perLevel", values: new Map([[1, v]]) };
}

export function addEffectItem(skill: Skill, scope: EffectScope, handler: string): void {
    let group = skill.effectGroups.find((g) => g.scope === scope);
    if (!group) {
        const wrapper = skill.el.ownerDocument.createElement(scope);
        skill.el.appendChild(wrapper);
        group = { scope, el: wrapper, items: [] };
        skill.effectGroups.push(group);
    }
    const itemEl = skill.el.ownerDocument.createElement("effect");
    if (handler) itemEl.setAttribute("name", handler);
    group.el.appendChild(itemEl);
    group.items.push({ kind: "effect", handler, el: itemEl, params: [], lists: [], blocks: [] });
}

export function removeSkillItem(skill: Skill, group: SkillGroup, item: SkillItem): void {
    item.el.remove();
    const ii = group.items.indexOf(item);
    if (ii >= 0) group.items.splice(ii, 1);
    if (group.items.length === 0) {
        group.el.remove();
        const gi = skill.effectGroups.indexOf(group);
        if (gi >= 0) skill.effectGroups.splice(gi, 1);
    }
}

export function condLeafEl(leaf: CondLeaf): Element {
    return leaf.kind === "handler" ? leaf.item.el : leaf.el;
}

export function addConditionGroup(skill: Skill, scope: ConditionScope): ConditionGroup {
    const wrapper = skill.el.ownerDocument.createElement(scope);
    skill.el.appendChild(wrapper);
    const group: ConditionGroup = { scope, el: wrapper, msgId: "", op: "and", opEl: wrapper, leaves: [] };
    skill.conditionGroups.push(group);
    return group;
}

export function removeConditionGroup(skill: Skill, group: ConditionGroup): void {
    group.el.remove();
    const gi = skill.conditionGroups.indexOf(group);
    if (gi >= 0) skill.conditionGroups.splice(gi, 1);
}

export function setConditionMsgId(group: ConditionGroup, value: string): void {
    const v = value.trim();
    if (v === "") group.el.removeAttribute("msgId");
    else group.el.setAttribute("msgId", v);
    group.msgId = v;
}

export function setConditionOp(group: ConditionGroup, op: "and" | "or" | "not"): void {
    if (op === group.op) return;
    const doc = group.el.ownerDocument;
    const leafEls = group.leaves.map(condLeafEl);
    if (op === "and") {
        for (const le of leafEls) group.el.appendChild(le);
        if (group.opEl !== group.el) group.opEl.remove();
        group.opEl = group.el;
    } else {
        const w = doc.createElement(op);
        if (group.opEl !== group.el) {
            group.opEl.replaceWith(w);
        } else {
            group.el.appendChild(w);
        }
        for (const le of leafEls) w.appendChild(le);
        group.opEl = w;
    }
    group.op = op;
}

export function addCondHandler(group: ConditionGroup, handler: string): void {
    const el = group.el.ownerDocument.createElement("condition");
    if (handler) el.setAttribute("name", handler);
    group.opEl.appendChild(el);
    group.leaves.push({ kind: "handler", item: { kind: "condition", handler, el, params: [], lists: [], blocks: [] } });
}

export function addCondCheck(group: ConditionGroup, tag: string): void {
    const el = group.el.ownerDocument.createElement(tag);
    group.opEl.appendChild(el);
    group.leaves.push({ kind: "check", tag, el, attrs: [] });
}

export function removeCondLeaf(skill: Skill, group: ConditionGroup, index: number): void {
    const leaf = group.leaves[index];
    if (!leaf) return;
    condLeafEl(leaf).remove();
    group.leaves.splice(index, 1);
    if (group.opEl !== group.el && group.opEl.children.length === 0) {
        group.opEl.remove();
        group.opEl = group.el;
        group.op = "and";
    }
    if (group.el.children.length === 0) {
        removeConditionGroup(skill, group);
    }
}

export function setCondCheckAttr(leaf: Extract<CondLeaf, { kind: "check" }>, name: string, value: string): void {
    const i = leaf.attrs.findIndex((a) => a.name === name);
    if (value.trim() === "" && i >= 0) {
        leaf.el.removeAttribute(name);
        leaf.attrs.splice(i, 1);
        return;
    }
    leaf.el.setAttribute(name, value);
    if (i >= 0) leaf.attrs[i].value = value;
    else leaf.attrs.push({ name, value });
}

export function renameCondCheck(leaf: Extract<CondLeaf, { kind: "check" }>, newTag: string): void {
    const t = newTag.trim();
    if (t === "" || t === leaf.tag) return;
    const el = leaf.el.ownerDocument.createElement(t);
    for (const a of leaf.attrs) el.setAttribute(a.name, a.value);
    leaf.el.replaceWith(el);
    leaf.el = el;
    leaf.tag = t;
}

export function setItemPerLevelParam(item: SkillItem, tag: string, level: number, value: string): void {
    const param = item.params.find((p) => p.tag === tag);
    if (!param || param.value.kind !== "perLevel") return;
    let parent = item.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (!parent) {
        parent = item.el.ownerDocument.createElement(tag);
        item.el.appendChild(parent);
    }
    let valueEl = Array.from(parent.children).find(
        (c) => c.tagName === "value" && Number(c.getAttribute("level") ?? "0") === level
    );
    if (!valueEl) {
        valueEl = item.el.ownerDocument.createElement("value");
        valueEl.setAttribute("level", String(level));
        const after = Array.from(parent.children).find(
            (c) => c.tagName === "value" && Number(c.getAttribute("level") ?? "0") > level
        );
        parent.insertBefore(valueEl, after ?? null);
    }
    valueEl.textContent = value;
    param.value.values.set(level, value);
}

export function deleteItemPerLevelParam(item: SkillItem, tag: string, level: number): void {
    const param = item.params.find((p) => p.tag === tag);
    if (!param || param.value.kind !== "perLevel") return;
    const parent = item.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (parent) {
        const valueEl = Array.from(parent.children).find(
            (c) => c.tagName === "value" && Number(c.getAttribute("level") ?? "0") === level
        );
        if (valueEl) parent.removeChild(valueEl);
    }
    param.value.values.delete(level);
}

export function setItemSublevelParam(
    item: SkillItem,
    tag: string,
    level: number,
    sublevel: number,
    value: string
): void {
    if (sublevel <= 0) {
        setItemPerLevelParam(item, tag, level, value);
        return;
    }
    const param = item.params.find((p) => p.tag === tag);
    let parent = item.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (!parent) {
        parent = item.el.ownerDocument.createElement(tag);
        item.el.appendChild(parent);
    }
    let valueEl: Element | undefined = Array.from(parent.children).find(
        (c) =>
            c.tagName === "value" &&
            Number(c.getAttribute("level") ?? "0") === level &&
            Number(c.getAttribute("subLevel") ?? "0") === sublevel
    );
    if (!valueEl) {
        valueEl = item.el.ownerDocument.createElement("value");
        valueEl.setAttribute("level", String(level));
        valueEl.setAttribute("subLevel", String(sublevel));
        const after = Array.from(parent.children).find((c) => {
            if (c.tagName !== "value") return false;
            const lvl = Number(c.getAttribute("level") ?? "0");
            const sub = Number(c.getAttribute("subLevel") ?? "0");
            return lvl > level || (lvl === level && sub > sublevel);
        });
        parent.insertBefore(valueEl, after ?? null);
    }
    valueEl.textContent = value;
    if (!param) {
        item.params.push({
            tag,
            value: { kind: "perSublevel", base: new Map(), overrides: new Map([[level, new Map([[sublevel, value]])]]) }
        });
        return;
    }
    if (param.value.kind === "single") {
        const base = new Map<number, string>();
        if (param.value.value !== "") base.set(1, param.value.value);
        param.value = { kind: "perSublevel", base, overrides: new Map([[level, new Map([[sublevel, value]])]]) };
        return;
    }
    if (param.value.kind === "perLevel") {
        param.value = {
            kind: "perSublevel",
            base: new Map(param.value.values),
            overrides: new Map([[level, new Map([[sublevel, value]])]])
        };
        return;
    }
    let inner = param.value.overrides.get(level);
    if (!inner) {
        inner = new Map<number, string>();
        param.value.overrides.set(level, inner);
    }
    inner.set(sublevel, value);
}

export function deleteItemSublevelParam(item: SkillItem, tag: string, level: number, sublevel: number): void {
    if (sublevel <= 0) {
        deleteItemPerLevelParam(item, tag, level);
        return;
    }
    const param = item.params.find((p) => p.tag === tag);
    if (!param || param.value.kind !== "perSublevel") return;
    const parent = item.el.querySelector(`:scope > ${cssEscape(tag)}`);
    if (parent) {
        const valueEl = Array.from(parent.children).find(
            (c) =>
                c.tagName === "value" &&
                Number(c.getAttribute("level") ?? "0") === level &&
                Number(c.getAttribute("subLevel") ?? "0") === sublevel
        );
        if (valueEl) parent.removeChild(valueEl);
    }
    const inner = param.value.overrides.get(level);
    if (inner) {
        inner.delete(sublevel);
        if (inner.size === 0) param.value.overrides.delete(level);
    }
    if (param.value.overrides.size === 0) param.value = { kind: "perLevel", values: param.value.base };
}
