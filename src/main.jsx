import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownToLine,
  CalendarDays,
  CircleDollarSign,
  Download,
  HandCoins,
  Plus,
  ReceiptText,
  Trash2,
  Upload,
  UsersRound,
  WalletCards
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'velvetember-trip-split:v1';

const seedState = {
  people: {
    you: 'You',
    gf: 'Girlfriend',
    friend1: 'Friend 1',
    friend2: 'Friend 2',
    friend3: 'Friend 3'
  },
  expenses: []
};

const payerOptions = ['you', 'gf', 'friend1', 'friend2', 'friend3'];
const friendKeys = ['friend1', 'friend2', 'friend3'];
const categories = ['Food', 'Stay', 'Travel', 'Tickets', 'Fuel', 'Shopping', 'Other'];

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return seedState;
    const parsed = JSON.parse(saved);
    return {
      people: { ...seedState.people, ...parsed.people },
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : []
    };
  } catch {
    return seedState;
  }
}

function saveState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function money(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Math.round(value || 0));
}

function payerGroup(payer) {
  return payer === 'you' || payer === 'gf' ? 'couple' : payer;
}

function displayPayer(payer, people) {
  if (payer === 'you') return people.you;
  if (payer === 'gf') return people.gf;
  return people[payer];
}

function computeLedger(expenses) {
  const balances = {
    couple: 0,
    friend1: 0,
    friend2: 0,
    friend3: 0
  };
  let total = 0;

  expenses.forEach((expense) => {
    const amount = Number(expense.amount) || 0;
    if (amount <= 0) return;

    total += amount;
    const share = amount / 5;
    const paidBy = payerGroup(expense.payer);

    balances[paidBy] += amount;
    balances.couple -= share * 2;
    friendKeys.forEach((key) => {
      balances[key] -= share;
    });
  });

  const settlements = settleBalances(balances);
  return { balances, settlements, total };
}

function settleBalances(balances) {
  const debtors = [];
  const creditors = [];

  Object.entries(balances).forEach(([key, value]) => {
    const rounded = Math.round(value);
    if (rounded < 0) debtors.push({ key, amount: Math.abs(rounded) });
    if (rounded > 0) creditors.push({ key, amount: rounded });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const rows = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].amount, creditors[c].amount);
    if (amount > 0) {
      rows.push({ from: debtors[d].key, to: creditors[c].key, amount });
    }
    debtors[d].amount -= amount;
    creditors[c].amount -= amount;
    if (debtors[d].amount === 0) d += 1;
    if (creditors[c].amount === 0) c += 1;
  }

  return rows;
}

function ledgerName(key, people) {
  if (key === 'couple') return `${people.you} + ${people.gf}`;
  return people[key];
}

function App() {
  const [trip, setTrip] = useState(loadState);
  const [form, setForm] = useState({
    payer: 'you',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    category: 'Food',
    note: ''
  });
  const [activePanel, setActivePanel] = useState('expenses');
  const [toast, setToast] = useState('');
  const fileInput = useRef(null);

  const ledger = useMemo(() => computeLedger(trip.expenses), [trip.expenses]);
  const latestExpenses = [...trip.expenses].sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`));
  const perPerson = ledger.total / 5;

  function updateTrip(updater) {
    setTrip((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      saveState(next);
      return next;
    });
  }

  function flash(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }

  function addExpense(event) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      flash('Enter a valid amount.');
      return;
    }

    const expense = {
      id: crypto.randomUUID(),
      payer: form.payer,
      amount,
      date: form.date || new Date().toISOString().slice(0, 10),
      category: form.category,
      note: form.note.trim() || form.category
    };

    updateTrip((current) => ({
      ...current,
      expenses: [expense, ...current.expenses]
    }));

    setForm((current) => ({ ...current, amount: '', note: '' }));
    flash('Expense added.');
  }

  function removeExpense(id) {
    updateTrip((current) => ({
      ...current,
      expenses: current.expenses.filter((expense) => expense.id !== id)
    }));
  }

  function renamePerson(key, value) {
    updateTrip((current) => ({
      ...current,
      people: {
        ...current.people,
        [key]: value
      }
    }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(trip, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `velvetember-trip-split-${new Date().toISOString().slice(0, 10)}.json`;
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
        if (!imported.people || !Array.isArray(imported.expenses)) throw new Error('Invalid file');
        const next = {
          people: { ...seedState.people, ...imported.people },
          expenses: imported.expenses.map((expense) => ({
            id: expense.id || crypto.randomUUID(),
            payer: payerOptions.includes(expense.payer) ? expense.payer : 'you',
            amount: Number(expense.amount) || 0,
            date: expense.date || new Date().toISOString().slice(0, 10),
            category: expense.category || 'Other',
            note: expense.note || 'Imported expense'
          }))
        };
        updateTrip(next);
        flash('Backup restored.');
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
      <section className="topbar" aria-label="Trip overview">
        <div>
          <p className="eyebrow">Velvetember split desk</p>
          <h1>Trip expenses, settled as one couple plus three friends.</h1>
        </div>
        <div className="top-actions">
          <button className="icon-button" type="button" onClick={exportData} aria-label="Download backup" title="Download backup">
            <Download size={18} />
          </button>
          <button className="icon-button" type="button" onClick={() => fileInput.current?.click()} aria-label="Import backup" title="Import backup">
            <Upload size={18} />
          </button>
          <input ref={fileInput} className="hidden-file" type="file" accept="application/json" onChange={importData} />
        </div>
      </section>

      <section className="hero-grid">
        <div className="metric-panel feature-panel">
          <div className="panel-art" aria-hidden="true">
            <div className="sun" />
            <div className="road" />
            <div className="pin pin-one" />
            <div className="pin pin-two" />
            <div className="pin pin-three" />
          </div>
          <div className="metric-content">
            <span className="metric-label"><WalletCards size={16} /> Total trip spend</span>
            <strong>{money(ledger.total)}</strong>
            <span>Equal share per person: {money(perPerson)}</span>
          </div>
        </div>

        <div className="metric-panel">
          <span className="metric-label"><UsersRound size={16} /> Couple share</span>
          <strong>{money(perPerson * 2)}</strong>
          <span>{trip.people.you} and {trip.people.gf} count as two shares, one settlement wallet.</span>
        </div>

        <div className="metric-panel">
          <span className="metric-label"><HandCoins size={16} /> Next settlement</span>
          <strong>{ledger.settlements[0] ? money(ledger.settlements[0].amount) : money(0)}</strong>
          <span>{ledger.settlements[0] ? `${ledgerName(ledger.settlements[0].from, trip.people)} pays ${ledgerName(ledger.settlements[0].to, trip.people)}` : 'All clear right now.'}</span>
        </div>
      </section>

      <section className="workspace">
        <aside className="side-panel">
          <div className="tabs" role="tablist" aria-label="App panels">
            <button className={activePanel === 'expenses' ? 'active' : ''} type="button" onClick={() => setActivePanel('expenses')}>
              <ReceiptText size={16} /> Expenses
            </button>
            <button className={activePanel === 'people' ? 'active' : ''} type="button" onClick={() => setActivePanel('people')}>
              <UsersRound size={16} /> People
            </button>
          </div>

          {activePanel === 'expenses' ? (
            <form className="expense-form" onSubmit={addExpense}>
              <label>
                Paid by
                <select value={form.payer} onChange={(event) => setForm({ ...form, payer: event.target.value })}>
                  {payerOptions.map((key) => (
                    <option key={key} value={key}>{displayPayer(key, trip.people)}</option>
                  ))}
                </select>
              </label>

              <label>
                Amount
                <div className="amount-field">
                  <CircleDollarSign size={18} />
                  <input
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(event) => setForm({ ...form, amount: event.target.value })}
                    placeholder="5000"
                  />
                </div>
              </label>

              <div className="form-row">
                <label>
                  Date
                  <div className="date-field">
                    <CalendarDays size={16} />
                    <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
                  </div>
                </label>
                <label>
                  Category
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Note
                <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Dinner, cab, hotel..." />
              </label>

              <button className="primary-button" type="submit">
                <Plus size={18} /> Add expense
              </button>
            </form>
          ) : (
            <div className="people-editor">
              {payerOptions.map((key) => (
                <label key={key}>
                  {key === 'you' ? 'You' : key === 'gf' ? 'Girlfriend' : `Friend ${friendKeys.indexOf(key) + 1}`}
                  <input value={trip.people[key]} onChange={(event) => renamePerson(key, event.target.value)} />
                </label>
              ))}
            </div>
          )}
        </aside>

        <section className="content-stack">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Settle up</p>
              <h2>Who owes whom</h2>
            </div>
            <span>{ledger.settlements.length} payment{ledger.settlements.length === 1 ? '' : 's'}</span>
          </div>

          <div className="settlement-list">
            {ledger.settlements.length ? (
              ledger.settlements.map((row, index) => (
                <article className="settlement-row" key={`${row.from}-${row.to}-${index}`}>
                  <div>
                    <span>{ledgerName(row.from, trip.people)}</span>
                    <small>pays</small>
                    <span>{ledgerName(row.to, trip.people)}</span>
                  </div>
                  <strong>{money(row.amount)}</strong>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <ArrowDownToLine size={22} />
                <span>No one owes anything yet.</span>
              </div>
            )}
          </div>

          <div className="balance-grid">
            {Object.entries(ledger.balances).map(([key, balance]) => (
              <article className={balance >= 0 ? 'balance-card positive' : 'balance-card negative'} key={key}>
                <span>{ledgerName(key, trip.people)}</span>
                <strong>{money(Math.abs(balance))}</strong>
                <small>{balance >= 0 ? 'should receive' : 'should pay'}</small>
              </article>
            ))}
          </div>

          <div className="section-heading">
            <div>
              <p className="eyebrow">Ledger</p>
              <h2>Expenses</h2>
            </div>
            <span>{trip.expenses.length} item{trip.expenses.length === 1 ? '' : 's'}</span>
          </div>

          <div className="expense-list">
            {latestExpenses.length ? (
              latestExpenses.map((expense) => (
                <article className="expense-row" key={expense.id}>
                  <div className="expense-main">
                    <span className="category-dot">{expense.category.slice(0, 1)}</span>
                    <div>
                      <strong>{expense.note}</strong>
                      <small>{expense.date} · paid by {displayPayer(expense.payer, trip.people)}</small>
                    </div>
                  </div>
                  <div className="expense-amount">
                    <strong>{money(expense.amount)}</strong>
                    <small>{money(expense.amount / 5)} each</small>
                  </div>
                  <button className="icon-button danger" type="button" onClick={() => removeExpense(expense.id)} aria-label={`Delete ${expense.note}`} title="Delete expense">
                    <Trash2 size={17} />
                  </button>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <ReceiptText size={22} />
                <span>Add the first expense to start the split.</span>
              </div>
            )}
          </div>
        </section>
      </section>

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
