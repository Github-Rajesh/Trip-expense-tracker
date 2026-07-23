'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  CircleDollarSign,
  Download,
  Landmark,
  Plus,
  ReceiptText,
  Trash2,
  Upload,
  UsersRound,
  WalletCards
} from 'lucide-react';

const STORAGE_KEY = 'velvetember-trip-split:v2';

const PEOPLE = [
  { id: 'rajesh', name: 'Rajesh', color: 'coral' },
  { id: 'kavya', name: 'Kavya', color: 'gold' },
  { id: 'dhanu', name: 'Dhanu', color: 'mint' },
  { id: 'shiva', name: 'Shiva', color: 'blue' },
  { id: 'anusha', name: 'Anusha', color: 'rose' }
];

const PERSON_BY_ID = Object.fromEntries(PEOPLE.map((person) => [person.id, person]));
const SETTLEMENT_GROUPS = [
  { id: 'rajesh-kavya', members: ['rajesh', 'kavya'] },
  { id: 'dhanu', members: ['dhanu'] },
  { id: 'shiva-anusha', members: ['shiva', 'anusha'] }
];
const GROUP_BY_MEMBER = Object.fromEntries(
  SETTLEMENT_GROUPS.flatMap((group) => group.members.map((member) => [member, group.id]))
);
const categories = ['Food', 'Stay', 'Travel', 'Tickets', 'Fuel', 'Shopping', 'Other'];

const seedState = { expenses: [] };

function loadState() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      const parsed = JSON.parse(current);
      return { expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [] };
    }

    // Keep past entries useful while moving to the fixed crew names.
    const legacy = localStorage.getItem('velvetember-trip-split:v1');
    if (!legacy) return seedState;
    const parsed = JSON.parse(legacy);
    const oldPayers = { you: 'rajesh', gf: 'kavya', friend1: 'dhanu', friend2: 'shiva', friend3: 'anusha' };
    return {
      expenses: Array.isArray(parsed.expenses)
        ? parsed.expenses.map((expense) => ({ ...expense, payer: oldPayers[expense.payer] || 'rajesh' }))
        : []
    };
  } catch {
    return seedState;
  }
}

function money(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Math.round(value || 0));
}

function personName(id) {
  return PERSON_BY_ID[id]?.name || 'Unknown';
}

function groupName(id) {
  const group = SETTLEMENT_GROUPS.find((item) => item.id === id);
  return group?.members.map(personName).join(' & ') || 'Unknown';
}

function computeLedger(expenses) {
  const personBalances = Object.fromEntries(PEOPLE.map((person) => [person.id, 0]));
  let total = 0;
  let paidTotal = 0;

  expenses.forEach((expense) => {
    const amount = Number(expense.amount) || 0;
    const billAmount = Number(expense.billAmount) || 0;
    if (amount <= 0 || !PERSON_BY_ID[expense.payer]) return;

    total += billAmount;
    paidTotal += amount;
    personBalances[expense.payer] += amount;
    const share = billAmount / PEOPLE.length;
    PEOPLE.forEach((person) => {
      personBalances[person.id] -= share;
    });
  });

  const groupBalances = Object.fromEntries(SETTLEMENT_GROUPS.map((group) => [group.id, 0]));
  Object.entries(personBalances).forEach(([person, balance]) => {
    groupBalances[GROUP_BY_MEMBER[person]] += balance;
  });

  return {
    total,
    paidTotal,
    pendingTotal: Math.max(0, total - paidTotal),
    personBalances,
    groupBalances,
    settlements: total - paidTotal > 0.5 ? [] : settleBalances(groupBalances)
  };
}

function settleBalances(balances) {
  const debtors = [];
  const creditors = [];

  Object.entries(balances).forEach(([key, value]) => {
    const amount = Math.round(Math.abs(value));
    if (value < -0.5) debtors.push({ key, amount });
    if (value > 0.5) creditors.push({ key, amount });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const rows = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount);
    if (amount) rows.push({ from: debtors[debtorIndex].key, to: creditors[creditorIndex].key, amount });
    debtors[debtorIndex].amount -= amount;
    creditors[creditorIndex].amount -= amount;
    if (debtors[debtorIndex].amount === 0) debtorIndex += 1;
    if (creditors[creditorIndex].amount === 0) creditorIndex += 1;
  }
  return rows;
}

function initials(name) {
  return name.slice(0, 1).toUpperCase();
}

function normalizeExpense(expense) {
  return {
    id: expense.id || crypto.randomUUID(),
    payer: PERSON_BY_ID[expense.payer] ? expense.payer : 'rajesh',
    amount: Number(expense.amount) || 0,
    billAmount: Number(expense.total_amount ?? expense.amount) || 0,
    date: expense.date || new Date().toISOString().slice(0, 10),
    category: categories.includes(expense.category) ? expense.category : 'Other',
    note: expense.note || 'Trip expense'
  };
}

function toRecord(expense) {
  const normalized = normalizeExpense(expense);
  return {
    id: normalized.id,
    payer: normalized.payer,
    amount: normalized.amount,
    total_amount: normalized.billAmount,
    date: normalized.date,
    category: normalized.category,
    note: normalized.note
  };
}

export default function Page() {
  const [trip, setTrip] = useState({ expenses: [] });
  const [form, setForm] = useState({
    payer: 'rajesh',
    amount: '',
    billAmount: '',
    paymentOnly: false,
    date: new Date().toISOString().slice(0, 10),
    category: 'Food',
    note: ''
  });
  const [toast, setToast] = useState('');
  const [syncStatus, setSyncStatus] = useState('connecting');
  const [isSaving, setIsSaving] = useState(false);
  const fileInput = useRef(null);
  const expensePanelRef = useRef(null);
  const supabaseRef = useRef(null);

  const ledger = useMemo(() => computeLedger(trip.expenses), [trip.expenses]);
  const stayLedger = useMemo(() => {
    const stays = trip.expenses.filter((expense) => expense.category === 'Stay');
    const total = stays.reduce((sum, expense) => sum + expense.billAmount, 0);
    const paid = stays.reduce((sum, expense) => sum + expense.amount, 0);
    return { total, paid, remaining: Math.max(0, total - paid) };
  }, [trip.expenses]);
  const latestExpenses = [...trip.expenses].sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));
  const leadingSettlement = ledger.settlements[0];

  useEffect(() => {
    let active = true;
    let channel;

    async function connectSharedLedger() {
      try {
        const response = await fetch('/api/config', { cache: 'no-store' });
        const config = await response.json();
        if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error('Missing shared ledger configuration');

        const client = createClient(config.supabaseUrl, config.supabasePublishableKey);
        supabaseRef.current = client;
        const { data, error } = await client.from('trip_expenses').select('*').order('created_at', { ascending: false });
        if (error) throw error;

        let remoteExpenses = (data || []).map(normalizeExpense);
        const localExpenses = loadState().expenses.map(normalizeExpense);
        if (!remoteExpenses.length && localExpenses.length) {
          const { data: migrated, error: migrationError } = await client
            .from('trip_expenses')
            .upsert(localExpenses.map(toRecord), { onConflict: 'id' })
            .select();
          if (migrationError) throw migrationError;
          remoteExpenses = (migrated || localExpenses).map(normalizeExpense);
        }

        if (!active) return;
        setTrip({ expenses: remoteExpenses });
        channel = client
          .channel('trip-expenses')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_expenses' }, (payload) => {
            if (!active) return;
            if (payload.eventType === 'DELETE') {
              setTrip((current) => ({ ...current, expenses: current.expenses.filter((expense) => expense.id !== payload.old.id) }));
              return;
            }
            const incoming = normalizeExpense(payload.new);
            setTrip((current) => ({
              ...current,
              expenses: [incoming, ...current.expenses.filter((expense) => expense.id !== incoming.id)]
            }));
          })
          .subscribe((status) => {
            if (!active) return;
            setSyncStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'error' : 'connecting');
          });
      } catch {
        if (active) setSyncStatus('error');
      }
    }

    connectSharedLedger();
    return () => {
      active = false;
      if (channel && supabaseRef.current) supabaseRef.current.removeChannel(channel);
    };
  }, []);

  function flash(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }

  function startStayPayment() {
    setForm((current) => ({ ...current, category: 'Stay', paymentOnly: stayLedger.total > 0, billAmount: '' }));
    expensePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function addExpense(event) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      flash('Enter a valid amount.');
      return;
    }

    if (!supabaseRef.current) {
      flash('The shared ledger is still connecting.');
      return;
    }

    const expense = {
      id: crypto.randomUUID(),
      payer: form.payer,
      amount,
      total_amount: form.paymentOnly ? 0 : Number(form.billAmount) || amount,
      date: form.date || new Date().toISOString().slice(0, 10),
      category: form.category,
      note: form.note.trim() || form.category
    };

    setIsSaving(true);
    try {
      const { data, error } = await supabaseRef.current.from('trip_expenses').insert(expense).select().single();
      if (error) throw error;
      const saved = normalizeExpense(data);
      setTrip((current) => ({ ...current, expenses: [saved, ...current.expenses.filter((item) => item.id !== saved.id)] }));
      setForm((current) => ({ ...current, amount: '', billAmount: '', note: '', paymentOnly: false }));
      flash('Expense shared with the crew.');
    } catch {
      flash('Could not save that expense. Try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function removeExpense(id) {
    if (!supabaseRef.current) return;
    setIsSaving(true);
    try {
      const { error } = await supabaseRef.current.from('trip_expenses').delete().eq('id', id);
      if (error) throw error;
      setTrip((current) => ({ ...current, expenses: current.expenses.filter((expense) => expense.id !== id) }));
      flash('Expense removed for everyone.');
    } catch {
      flash('Could not remove that expense.');
    } finally {
      setIsSaving(false);
    }
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(trip, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `velvetember-trip-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    flash('Backup downloaded.');
  }

  function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!Array.isArray(imported.expenses)) throw new Error('Invalid file');
        const expenses = imported.expenses.map(normalizeExpense);
        if (!supabaseRef.current) throw new Error('Not connected');
        supabaseRef.current.from('trip_expenses').upsert(expenses.map(toRecord), { onConflict: 'id' }).then(({ error }) => {
          if (error) throw error;
          setTrip((current) => ({ ...current, expenses: [...expenses, ...current.expenses.filter((expense) => !expenses.some((item) => item.id === expense.id))] }));
          flash('Backup merged into the shared ledger.');
        }).catch(() => flash('That backup could not be saved.'));
      } catch {
        flash('That backup could not be read.');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Velvetember trip split">
          <span className="brand-mark"><Landmark size={18} /></span>
          <span>Velvetember</span>
        </a>
        <div className="topbar-actions">
          <button className="icon-button" type="button" onClick={exportData} aria-label="Download backup" title="Download backup"><Download size={18} /></button>
          <button className="icon-button" type="button" onClick={() => fileInput.current?.click()} aria-label="Import backup" title="Import backup"><Upload size={18} /></button>
          <input ref={fileInput} className="hidden-file" type="file" accept="application/json" onChange={importData} />
        </div>
      </header>

      <section className="intro" id="top">
        <div>
          <p className="eyebrow">Five friends. One clean ledger.</p>
          <h1>Keep the good memories.<br />We will handle the math.</h1>
        </div>
        <div className="crew" aria-label="Trip crew">
          {PEOPLE.map((person) => <span className={`avatar ${person.color}`} title={person.name} key={person.id}>{initials(person.name)}</span>)}
          <span className="crew-copy">The trip crew<br /><strong>5 people</strong></span>
        </div>
      </section>

      <section className="summary-grid" aria-label="Trip summary">
        <article className="summary-card total-card">
          <div className="summary-heading"><span><WalletCards size={17} /> Total spent</span><span className={`live-dot ${syncStatus}`}>{syncStatus === 'live' ? 'Live' : syncStatus === 'error' ? 'Offline' : 'Syncing'}</span></div>
          <strong>{money(ledger.total)}</strong>
          <small>{trip.expenses.length} expense{trip.expenses.length === 1 ? '' : 's'} logged</small>
          <div className="summary-decoration" aria-hidden="true" />
        </article>
        <article className="summary-card">
          <div className="summary-heading"><span><UsersRound size={17} /> Paid so far</span></div>
          <strong>{money(ledger.paidTotal)}</strong>
          <small>Final share per person: {money(ledger.total / PEOPLE.length)}</small>
        </article>
        <article className="summary-card">
          <div className="summary-heading"><span><Check size={17} /> {ledger.pendingTotal ? 'Still unpaid' : 'Settle up'}</span></div>
          <strong>{ledger.pendingTotal ? money(ledger.pendingTotal) : leadingSettlement ? money(leadingSettlement.amount) : 'All clear'}</strong>
          <small>{ledger.pendingTotal ? 'Finish paying the bills before settling among friends.' : leadingSettlement ? `${groupName(leadingSettlement.from)} owes ${groupName(leadingSettlement.to)}` : 'No payments needed right now.'}</small>
        </article>
      </section>

      <section className="stay-tracker" aria-label="Stay payment tracker">
        <div className="stay-title"><span className="stay-icon"><BedDouble size={19} /></span><div><p className="eyebrow">Accommodation</p><h2>Stay payments</h2></div></div>
        <div className="stay-stat"><span>Total stay cost</span><strong>{money(stayLedger.total)}</strong></div>
        <div className="stay-stat"><span>Advance paid</span><strong>{money(stayLedger.paid)}</strong></div>
        <div className="stay-stat due"><span>Still to pay</span><strong>{money(stayLedger.remaining)}</strong></div>
        <button className="stay-action" type="button" onClick={startStayPayment}><Plus size={17} /> Add stay payment</button>
      </section>

      <section className="dashboard">
        <aside className="expense-panel" ref={expensePanelRef}>
          <div className="panel-title">
            <p className="eyebrow">New entry</p>
            <h2>Add an expense</h2>
          </div>
          <form className="expense-form" onSubmit={addExpense}>
            <label>
              Who paid?
              <select value={form.payer} onChange={(event) => setForm({ ...form, payer: event.target.value })}>
                {PEOPLE.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
            <label>
              Amount paid now
              <div className="amount-field"><CircleDollarSign size={18} /><input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="5,000" /></div>
            </label>
            <label>
              Full bill total
              <div className="amount-field"><CircleDollarSign size={18} /><input inputMode="decimal" value={form.billAmount} onChange={(event) => setForm({ ...form, billAmount: event.target.value })} placeholder="Leave blank when paid in full" disabled={form.paymentOnly} /></div>
            </label>
            <label className="payment-toggle"><input type="checkbox" checked={form.paymentOnly} onChange={(event) => setForm({ ...form, paymentOnly: event.target.checked, billAmount: '' })} /> This is a later payment for an existing bill</label>
            <div className="form-row">
              <label>
                Date
                <div className="date-field"><CalendarDays size={16} /><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></div>
              </label>
              <label>
                Category
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select>
              </label>
            </div>
            <label>
              What was it for?
              <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Dinner, cab, hotel..." />
            </label>
            <button className="primary-button" type="submit" disabled={isSaving || syncStatus === 'error'}><Plus size={18} /> {isSaving ? 'Saving...' : 'Add expense'}</button>
          </form>
          <p className="panel-note">For a partial bill, enter what was paid now and the full bill total. Add later payments with the checkbox on.</p>
        </aside>

        <div className="main-column">
          <section className="section-block">
            <div className="section-heading"><div><p className="eyebrow">Settle up</p><h2>Who owes whom</h2></div><span>{ledger.settlements.length} payment{ledger.settlements.length === 1 ? '' : 's'}</span></div>
            <div className="settlement-list">
              {ledger.pendingTotal ? <div className="empty-state"><ReceiptText size={22} /><span>{money(ledger.pendingTotal)} remains to be paid on the trip bills.</span></div> : ledger.settlements.length ? ledger.settlements.map((row, index) => (
                <article className="settlement-row" key={`${row.from}-${row.to}-${index}`}>
                  <div className="transfer-party"><span className="transfer-avatar">{initials(groupName(row.from))}</span><div><strong>{groupName(row.from)}</strong><small>owes</small></div></div>
                  <ArrowRight className="transfer-arrow" size={19} />
                  <div className="transfer-party"><span className="transfer-avatar receive">{initials(groupName(row.to))}</span><div><strong>{groupName(row.to)}</strong><small>to receive</small></div></div>
                  <b>{money(row.amount)}</b>
                </article>
              )) : <div className="empty-state"><Check size={22} /><span>Everything is square. Lovely.</span></div>}
            </div>
          </section>

          <section className="section-block">
            <div className="section-heading"><div><p className="eyebrow">Snapshot</p><h2>Individual balances</h2></div><span>Partner balances are netted for payments</span></div>
            <div className="balance-grid">
              {PEOPLE.map((person) => {
                const balance = ledger.personBalances[person.id];
                return <article className={`balance-card ${balance >= 0 ? 'positive' : 'negative'}`} key={person.id}>
                  <span className={`avatar ${person.color}`}>{initials(person.name)}</span>
                  <div><strong>{person.name}</strong><small>{balance >= 0 ? 'should receive' : 'should pay'}</small></div>
                  <b>{money(Math.abs(balance))}</b>
                </article>;
              })}
            </div>
          </section>

          <section className="section-block expenses-block">
            <div className="section-heading"><div><p className="eyebrow">Ledger</p><h2>All expenses</h2></div><span>{trip.expenses.length} item{trip.expenses.length === 1 ? '' : 's'}</span></div>
            <div className="expense-list">
              {latestExpenses.length ? latestExpenses.map((expense) => {
                const person = PERSON_BY_ID[expense.payer] || PEOPLE[0];
                return <article className="expense-row" key={expense.id}>
                  <span className="category-icon">{expense.category.slice(0, 1)}</span>
                <div className="expense-main"><strong>{expense.note}</strong><small>{expense.category} &middot; {expense.date} &middot; paid by {person.name}</small></div>
                  <div className="expense-amount"><strong>{money(expense.amount)} paid</strong><small>{expense.billAmount ? `${money(expense.amount)} of ${money(expense.billAmount)} bill` : 'Later bill payment'}</small></div>
                  <button className="icon-button danger" type="button" onClick={() => removeExpense(expense.id)} aria-label={`Delete ${expense.note}`} title="Delete expense"><Trash2 size={17} /></button>
                </article>;
              }) : <div className="empty-state"><ReceiptText size={22} /><span>Your first expense will appear here.</span></div>}
            </div>
          </section>
        </div>
      </section>

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}
