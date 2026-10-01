// گراف مهارت حسابداری (spec 0015): the skills of a gold shop's books and their prerequisites. Mastery and the
// next-exercise policy come from the shared skill graph (public/js/skillgraph.mjs, spec 0016), the same for every
// domain of Beatris.
import { createGraph } from '../skillgraph.mjs';
export { DIFFICULTIES, DIFFICULTY_FA, emptyMastery, updateMastery, difficultyFor } from '../skillgraph.mjs';

export const SKILLS = [
  { id: 'fund', fa: 'مبانی حسابداری', parent: null, needs: [] },
  { id: 'dc', fa: 'بدهکار و بستانکار', parent: 'fund', needs: [] },
  { id: 'journal', fa: 'سند روزنامه', parent: 'fund', needs: ['dc'] },
  { id: 'ledger', fa: 'دفتر کل', parent: 'fund', needs: ['journal'] },
  { id: 'trial', fa: 'تراز آزمایشی', parent: 'fund', needs: ['ledger'] },
  { id: 'customers', fa: 'حساب مشتریان', parent: 'fund', needs: ['journal'] },
  { id: 'suppliers', fa: 'حساب تأمین‌کنندگان', parent: 'fund', needs: ['journal'] },
  { id: 'cash', fa: 'صندوق', parent: 'fund', needs: ['dc'] },
  { id: 'bank', fa: 'بانک', parent: 'fund', needs: ['dc'] },
  { id: 'inventory', fa: 'موجودی طلا', parent: 'fund', needs: ['journal'] },
  { id: 'weight', fa: 'حسابداری وزنی و عیار', parent: 'fund', needs: ['inventory'] },
  { id: 'making', fa: 'اجرت و سود', parent: 'fund', needs: ['journal'] },
  { id: 'tax', fa: 'مالیات', parent: 'fund', needs: ['making'] },
  { id: 'settlement', fa: 'تسویه', parent: 'fund', needs: ['customers', 'suppliers'] },
  { id: 'recon', fa: 'مغایرت‌گیری', parent: 'fund', needs: ['weight', 'cash'] },
  { id: 'closing', fa: 'بستن روز', parent: 'fund', needs: ['recon', 'trial'] },
  { id: 'audit', fa: 'حسابرسی', parent: 'fund', needs: ['closing'] },
];
const G = createGraph(SKILLS, { domain: 'accounting', start: 'dc' });
export const SKILL = G.SKILL;
export const LEAF_SKILLS = G.LEAF;
export const unlocked = G.unlocked;
export const nextFocus = G.nextFocus;
export const readiness = G.readiness;
