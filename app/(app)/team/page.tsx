"use client";

import { FormEvent, useEffect, useState } from "react";
import { money } from "@/lib/money";

type Member = {
  id: number;
  name: string;
  phone: string;
  role: string;
  monthlyAllowanceCents: number | null;
  maxSingleQrCents: number | null;
  autoApproveUnderCents: number | null;
};

export default function TeamPage() {
  const [rows, setRows] = useState<Member[] | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    const r = await fetch("/api/team");
    setRows(r.ok ? (await r.json()).users : []);
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(id: number) {
    if (!confirm("Remove this person?")) return;
    await fetch(`/api/team/${id}`, { method: "DELETE" });
    await load();
  }

  if (rows === null) return <div className="p-8 text-muted text-sm">Loading…</div>;

  return (
    <div className="p-8 w-full">
      <header className="mb-5 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-muted text-sm mt-1">{rows.length} people · spending controls per employee</p>
        </div>
        <button onClick={() => setAdding(true)} className="btn btn-primary text-sm">+ Add person</button>
      </header>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm">No one yet — add a manager and employees who message the WhatsApp agent.</div>
      ) : (
        <div className="card">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-card">
              <tr className="text-muted text-left">
                <th className="font-medium px-4 py-3 border-b border-line">NAME</th>
                <th className="font-medium px-4 py-3 border-b border-line">ROLE</th>
                <th className="font-medium px-4 py-3 border-b border-line">PHONE</th>
                <th className="font-medium px-4 py-3 border-b border-line text-right">ALLOWANCE / MO</th>
                <th className="font-medium px-4 py-3 border-b border-line text-right">MAX / PAYMENT</th>
                <th className="font-medium px-4 py-3 border-b border-line text-right">AUTO-APPROVE &lt;</th>
                <th className="font-medium px-4 py-3 border-b border-line w-20"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-foreground/[0.03]">
                  <td className="px-4 py-3 border-t border-line font-medium">{m.name}</td>
                  <td className="px-4 py-3 border-t border-line">
                    <span className="pill">{m.role}</span>
                  </td>
                  <td className="px-4 py-3 border-t border-line text-muted tabular-nums">{m.phone}</td>
                  <td className="px-4 py-3 border-t border-line text-right tabular-nums">{m.role === "employee" ? (m.monthlyAllowanceCents != null ? money(m.monthlyAllowanceCents, "HKD") : "unlimited") : "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-right tabular-nums">{m.role === "employee" ? (m.maxSingleQrCents != null ? money(m.maxSingleQrCents, "HKD") : "—") : "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-right tabular-nums">{m.role === "employee" ? (m.autoApproveUnderCents != null ? money(m.autoApproveUnderCents, "HKD") : "off") : "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-right whitespace-nowrap">
                    <button onClick={() => setEditing(m)} className="text-muted hover:text-foreground" aria-label="Edit">✎</button>
                    <button onClick={() => remove(m.id)} className="ml-3 text-muted hover:text-red-500" aria-label="Remove">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <EditModal member={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {adding && <AddModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function hkd(cents: number | null): string {
  return cents != null ? (cents / 100).toString() : "";
}

function EditModal({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(member.phone);
  const [role, setRole] = useState(member.role);
  const [allowance, setAllowance] = useState(hkd(member.monthlyAllowanceCents));
  const [maxQr, setMaxQr] = useState(hkd(member.maxSingleQrCents));
  const [autoApprove, setAutoApprove] = useState(hkd(member.autoApproveUnderCents));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const r = await fetch(`/api/team/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        role,
        monthlyAllowanceHkd: allowance === "" ? 0 : Number(allowance),
        maxSingleQrHkd: maxQr === "" ? 0 : Number(maxQr),
        autoApproveUnderHkd: autoApprove === "" ? 0 : Number(autoApprove),
      }),
    });
    if (r.ok) return onSaved();
    setError((await r.json().catch(() => ({})))?.error ?? "Failed");
    setSaving(false);
  }

  return (
    <Modal title={`Edit ${member.name}`} onClose={onClose} onSubmit={submit} saving={saving}>
      {error && <div className="px-4 py-3 rounded-lg bg-card border border-foreground text-sm">{error}</div>}
      <Field label="Name"><Inp v={name} on={setName} /></Field>
      <Field label="WhatsApp phone (E.164)"><Inp v={phone} on={setPhone} placeholder="+85291234567" /></Field>
      <Field label="Role">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm">
          <option value="employee">employee</option>
          <option value="manager">manager</option>
        </select>
      </Field>
      <p className="text-xs text-muted pt-1">Limits (HKD, blank/0 = no limit). Apply to employees.</p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Allowance/mo"><Inp v={allowance} on={setAllowance} placeholder="5000" /></Field>
        <Field label="Max/payment"><Inp v={maxQr} on={setMaxQr} placeholder="1000" /></Field>
        <Field label="Auto-approve <"><Inp v={autoApprove} on={setAutoApprove} placeholder="200" /></Field>
      </div>
    </Modal>
  );
}

function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("employee");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const r = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, role }),
    });
    if (r.ok) return onSaved();
    setError((await r.json().catch(() => ({})))?.error ?? "Failed");
    setSaving(false);
  }

  return (
    <Modal title="Add person" onClose={onClose} onSubmit={submit} saving={saving}>
      {error && <div className="px-4 py-3 rounded-lg bg-card border border-foreground text-sm">{error}</div>}
      <Field label="Name *"><Inp v={name} on={setName} autoFocus /></Field>
      <Field label="WhatsApp phone * (E.164)"><Inp v={phone} on={setPhone} placeholder="+85291234567" /></Field>
      <Field label="Role">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm">
          <option value="employee">employee</option>
          <option value="manager">manager</option>
        </select>
      </Field>
    </Modal>
  );
}

function Modal({ title, onClose, onSubmit, saving, children }: { title: string; onClose: () => void; onSubmit: (e: FormEvent) => void; saving: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={onSubmit} className="card w-full max-w-md flex flex-col">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost text-sm">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3">{children}</div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn btn-primary disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}
function Inp({ v, on, placeholder, autoFocus }: { v: string; on: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <input value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
      className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
  );
}
