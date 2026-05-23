export class XmlParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "XmlParseError";
    }
}

export function parseXml(text: string): { doc: XMLDocument; rootName: string } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "application/xml");
    const err = doc.querySelector("parsererror");
    if (err) {
        throw new XmlParseError(err.textContent ?? "malformed xml");
    }
    const root = doc.documentElement;
    if (!root) {
        throw new XmlParseError("empty document");
    }
    return { doc, rootName: root.tagName };
}

export function serializeXml(doc: XMLDocument): string {
    return new XMLSerializer().serializeToString(doc);
}
