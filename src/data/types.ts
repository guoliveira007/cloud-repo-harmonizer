export type RawLesson = [
  date: string,
  professor: string,
  frente: string,
  title: string,
  url: string,
];

export type Lesson = {
  id: string;
  date: string;
  month: string;
  professor: string;
  frente: string;
  title: string;
  url: string;
  subject: string;
};

export type Subject = {
  id: string;
  label: string;
  area: string;
  tagline: string;
  lessons: Lesson[];
  professors: string[];
  months: string[];
};
