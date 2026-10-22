// Начальные данные: расписание 1-го семестра 2026–2027 (ЦУТ-171), предметы и настройки.
// id фиксированные, поэтому на разных устройствах они совпадают и не дублируются.

export const DEFAULT_PAIRS = [
  ['08:30', '09:50'], ['10:05', '11:25'], ['11:40', '13:00'], ['13:45', '15:05'],
  ['15:20', '16:40'], ['16:55', '18:15'], ['18:30', '19:50'], ['20:00', '21:20'],
];

export const DEFAULT_SETTINGS = {
  semesterStart: '2026-09-01',
  semesterEnd: '2027-01-04',
  group: 'ЦУТ-171',
  subgroup: 0,                 // 0 — показывать обе подгруппы
  pairs: DEFAULT_PAIRS,
  taskCategories: [
    { id: 'personal', name: 'Личное', color: '#14a37f' },
    { id: 'work', name: 'Работа', color: '#e8900c' },
    { id: 'sport', name: 'Спорт', color: '#e5484d' },
    { id: 'home', name: 'Быт', color: '#8e6cef' },
  ],
  taskTypes: ['ДЗ', 'Лаба', 'Курсовая', 'Реферат', 'Тест', 'Конспект', 'Другое'],
  moneyCategories: ['Еда', 'Транспорт', 'Учёба', 'Развлечения', 'Связь', 'Одежда', 'Здоровье', 'Другое'],
  incomeCategories: ['Стипендия', 'Работа', 'Родители', 'Другое'],
  roots: [{ id: 'study', name: 'Учёба' }, { id: 'code', name: 'Проекты' }],
  absenceLimit: 3,
  notify: { lessonMin: 15, deadlineHours: 24 },
};

const S = {
  vmo: 'seed-subj-vmo', inyaz: 'seed-subj-inyaz', sptu: 'seed-subj-sptu', ktuts: 'seed-subj-ktuts', isut: 'seed-subj-isut',
};

const subjects = [
  { id: S.vmo, name: 'Введение в машинное обучение', short: 'ВМО', tag: 'вмо', color: '#4f6bed', control: 'Зачёт', coursework: false,
    teachers: [{ name: 'Зольникова Н.Н.', role: 'лекции, лабы', contact: '' }], labsTotal: 0 },
  { id: S.inyaz, name: 'Иностранный язык', short: 'Иняз', tag: 'иняз', color: '#14a37f', control: 'Зачёт', coursework: false,
    teachers: [{ name: 'Быкова Е.А.', role: 'практика', contact: '' }, { name: 'Колос Л.Е.', role: 'зачёт (или Быкова)', contact: '' }], labsTotal: 0 },
  { id: S.sptu, name: 'Современные проблемы теории управления', short: 'СПТУ', tag: 'спту', color: '#8e6cef', control: 'Экзамен', coursework: true,
    teachers: [{ name: 'Иконников С.Е.', role: 'лекции, лабы', contact: '' }], labsTotal: 0 },
  { id: S.ktuts, name: 'Компьютерные технологии управления в технических системах', short: 'КТУТС', tag: 'ктутс', color: '#e8900c', control: 'Экзамен', coursework: true,
    teachers: [{ name: 'Янченко Г.О.', role: 'лекции, лабы', contact: '' }, { name: 'Сафронов А.И.', role: 'лабы', contact: '' }], labsTotal: 0 },
  { id: S.isut, name: 'Интеллектуальные системы управления на транспорте', short: 'ИСУТ', tag: 'исут', color: '#e5484d', control: 'Экзамен', coursework: true,
    teachers: [{ name: 'Новиков В.Г.', role: 'лекции, лабы', contact: '' }, { name: 'Сафронов А.И.', role: 'лабы', contact: '' }], labsTotal: 0 },
].map(s => ({ kind: 'subject', links: [], requirements: '', grades: [], labsDone: 0, notes: '', attachments: [], ...s }));

// week: 1 — I неделя (нечётная), 2 — II неделя (чётная), 0 — каждую
const L = (n, week, day, pair, subjectId, type, teachers, room, subgroup = 0) =>
  ({ id: `seed-lesson-${String(n).padStart(2, '0')}`, kind: 'lesson', week, day, pair, subjectId, type, teachers, room, subgroup });

const lessons = [
  // I неделя
  L(1, 1, 1, 7, S.vmo, 'Лекция', ['Зольникова Н.Н.'], '4420'),
  L(2, 1, 1, 8, S.vmo, 'Лабораторная', ['Зольникова Н.Н.'], '4420'),
  L(3, 1, 2, 7, S.sptu, 'Лекция', ['Иконников С.Е.'], '4534'),
  L(4, 1, 2, 8, S.sptu, 'Лекция', ['Иконников С.Е.'], '4534'),
  L(5, 1, 3, 7, S.inyaz, 'Практика', ['Быкова Е.А.'], '4329'),
  L(6, 1, 3, 8, S.inyaz, 'Практика', ['Быкова Е.А.'], '4329'),
  L(7, 1, 4, 7, S.ktuts, 'Лекция', ['Янченко Г.О.'], '4532'),
  L(8, 1, 4, 8, S.ktuts, 'Лабораторная', ['Сафронов А.И.', 'Янченко Г.О.'], '4532'),
  L(9, 1, 5, 7, S.isut, 'Лекция', ['Новиков В.Г.'], '4325'),
  L(10, 1, 5, 8, S.isut, 'Лабораторная', ['Новиков В.Г.', 'Сафронов А.И.'], '4525'),
  // II неделя
  L(11, 2, 1, 7, S.vmo, 'Лекция', ['Зольникова Н.Н.'], '4420'),
  L(12, 2, 1, 8, S.vmo, 'Лабораторная', ['Зольникова Н.Н.'], '4420'),
  L(13, 2, 2, 7, S.sptu, 'Лабораторная', ['Иконников С.Е.'], '4325'),
  L(14, 2, 2, 8, S.sptu, 'Лабораторная', ['Иконников С.Е.'], '4325'),
  // Среда II недели — свободный день
  L(17, 2, 4, 7, S.ktuts, 'Лекция', ['Янченко Г.О.'], '4532'),
  L(18, 2, 5, 7, S.isut, 'Лекция', ['Новиков В.Г.'], '4325'),
  L(19, 2, 5, 8, S.isut, 'Лабораторная', ['Новиков В.Г.', 'Сафронов А.И.'], '4525'),
];

const exams = [
  { id: 'seed-exam-vmo', subjectId: S.vmo, type: 'Зачёт' },
  { id: 'seed-exam-inyaz', subjectId: S.inyaz, type: 'Зачёт' },
  { id: 'seed-exam-sptu', subjectId: S.sptu, type: 'Экзамен' },
  { id: 'seed-exam-ktuts', subjectId: S.ktuts, type: 'Экзамен' },
  { id: 'seed-exam-isut', subjectId: S.isut, type: 'Экзамен' },
  { id: 'seed-cw-sptu', subjectId: S.sptu, type: 'Защита курсовой' },
  { id: 'seed-cw-ktuts', subjectId: S.ktuts, type: 'Защита курсовой' },
  { id: 'seed-cw-isut', subjectId: S.isut, type: 'Защита курсовой' },
].map(e => ({ kind: 'exam', date: '', time: '', room: '', notes: '', questions: [], ...e }));

const habits = [
  { id: 'seed-habit-sleep', kind: 'habit', title: 'Сон 7+ часов', emoji: '😴', log: {} },
  { id: 'seed-habit-sport', kind: 'habit', title: 'Спорт / прогулка', emoji: '🏃', log: {} },
  { id: 'seed-habit-water', kind: 'habit', title: '2 литра воды', emoji: '💧', log: {} },
];

// Записи из прошлых версий начального набора, которых больше нет
export const SEED_REMOVED = ['seed-lesson-15', 'seed-lesson-16'];

export const SEED = [
  { id: 'settings', kind: 'settings', ...DEFAULT_SETTINGS },
  ...subjects, ...lessons, ...exams, ...habits,
];
