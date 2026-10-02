insert into public.slang_words (category, word, language) values
('severe','teri mammi ki','hindi'),('severe','teri ma ki','hindi'),('severe','teri amma ki','hindi'),('severe','teri maa ka','hindi'),('severe','teri bahen ki','hindi'),('severe','maa ki chut','hindi'),('severe','behen ki chut','hindi'),
('abuse','bhosadike','hindi'),('abuse','bhosdi ke','hindi'),('abuse','bhosdiwale','hindi'),('abuse','bhenchod','hindi'),('abuse','bahenchod','hindi'),('abuse','madharchod','hindi'),('abuse','lodu','hindi'),('abuse','chod','hindi'),('abuse','gaand','hindi'),('abuse','randwa','hindi'),
('mild','chutiye','hindi'),('mild','haramzada','hindi'),('mild','kamine','hindi'),('mild','kutiya','hindi'),('mild','suar','hindi'),
('provoking','bahar mil','hindi'),('provoking','teri aukat','hindi'),('provoking','aukat dikha','hindi')
on conflict (category, word) do nothing;