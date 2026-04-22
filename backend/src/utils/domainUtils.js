import { domainToASCII } from "url";

export const PUBLIC_DOMAINS = new Set([
    "gmail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com",
    "live.com", "aol.com", "icloud.com", "me.com", "mac.com",
    "protonmail.com", "proton.me", "zoho.com", "zoho.in",
    "yandex.com", "mail.com", "gmx.com", "gmx.net",
    "rediffmail.com", "msn.com", "mail.ru",
    "googlemail.com", "fastmail.com", "tutanota.com",
]);

export function normalizeDomain(raw = "") {
    let domain = String(raw || "").trim().toLowerCase();
    if (!domain) return "";

    domain = domain
        .replace(/^mailto:/, "")
        .replace(/^@+/, "")
        .replace(/[<>\[\]()"',;:]+/g, "")
        .replace(/\.+$/, "");

    const ascii = domainToASCII(domain);
    const normalized = (ascii || domain).trim().toLowerCase();

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized)) {
        return "";
    }

    return normalized;
}

export function extractDomainFromEmail(email = "") {
    const value = String(email || "").trim().toLowerCase();
    const atIndex = value.lastIndexOf("@");
    if (atIndex === -1) return "";
    return normalizeDomain(value.slice(atIndex + 1));
}

export function buildDomainCandidates(domain = "") {
    const normalized = normalizeDomain(domain);
    if (!normalized) return [];

    const parts = normalized.split(".");
    const candidates = [];
    for (let i = 0; i < parts.length - 1; i += 1) {
        const candidate = parts.slice(i).join(".");
        if (candidate.includes(".")) {
            candidates.push(candidate);
        }
    }
    return [...new Set(candidates)];
}

export function isPublicEmailDomain(domain = "") {
    const normalized = normalizeDomain(domain);
    return normalized ? PUBLIC_DOMAINS.has(normalized) : false;
}
