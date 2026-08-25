import type { Account, Budget, Category, Person, Settlement, Transaction } from "./types";

export function accountBalance(account: Account, transactions: Transaction[]) {
  return transactions.reduce((balance, transaction) => {
    if (transaction.deletedAt) return balance;
    if (transaction.type === "expense" && transaction.accountId === account.id) {
      return balance - transaction.amount;
    }
    if (transaction.type === "income" && transaction.accountId === account.id) {
      return balance + transaction.amount;
    }
    if (transaction.type === "transfer") {
      if (transaction.accountId === account.id) return balance - transaction.amount;
      if (transaction.toAccountId === account.id) return balance + transaction.amount;
    }
    return balance;
  }, account.openingBalance);
}

export function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function sameMonth(value: string, key = monthKey()) {
  return value.slice(0, 7) === key;
}

export function sameDay(value: string, day: string) {
  return value.slice(0, 10) === day;
}

export function summarize(transactions: Transaction[], day = new Date().toISOString().slice(0, 10)) {
  const active = transactions.filter((item) => !item.deletedAt);
  const monthly = active.filter((item) => sameMonth(item.date));
  const daily = active.filter((item) => sameDay(item.date, day));
  const income = monthly.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expenses = monthly.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const todaySpend = daily.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);

  return {
    monthlyIncome: income,
    monthlyExpenses: expenses,
    monthlySavings: income - expenses,
    todaySpend,
    dailyIncome: daily.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0),
    dailyExpenses: daily.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0),
  };
}

export function categorySpend(categories: Category[], transactions: Transaction[]) {
  return categories
    .filter((category) => category.kind === "expense" && category.active)
    .map((category) => ({
      category,
      amount: transactions
        .filter((item) => item.type === "expense" && item.categoryId === category.id && sameMonth(item.date) && !item.deletedAt)
        .reduce((sum, item) => sum + item.amount, 0),
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function budgetUsage(budget: Budget, transactions: Transaction[]) {
  const spent = transactions
    .filter((item) => item.type === "expense" && item.categoryId === budget.categoryId && sameMonth(item.date) && !item.deletedAt)
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    spent,
    remaining: budget.amount - spent,
    percentage: budget.amount > 0 ? Math.min(100, Math.round((spent / budget.amount) * 100)) : 0,
  };
}

export function personBalance(person: Person, settlements: Settlement[]) {
  return settlements
    .filter((item) => item.personId === person.id && !item.deletedAt)
    .reduce((sum, item) => {
      const remaining = item.originalAmount - item.repaidAmount;
      return item.direction === "to_me" ? sum + remaining : sum - remaining;
    }, 0);
}
