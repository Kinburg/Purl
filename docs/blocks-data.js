// ── Block types data ──────────────────────────────────────────
window.PURL_BLOCKS = [
  {
    id: 'text', kind: 'narrative', name_en: 'Text', name_uk: 'Текст',
    desc_en: 'Text paragraph with SugarCube markup support. Live mode for auto-refresh when variables change. Typewriter effect available.',
    desc_uk: 'Абзац тексту з підтримкою розмітки SugarCube. Live-режим для автоматичного оновлення при зміні змінних. Є ефект друкарської машинки.',
    tags: ['markup', 'live', 'typewriter'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="7" width="26" height="2.5" rx="1.25" fill="var(--accent)"/><rect x="3" y="13" width="20" height="2.5" rx="1.25" fill="var(--accent)" opacity=".7"/><rect x="3" y="19" width="24" height="2.5" rx="1.25" fill="var(--accent)" opacity=".7"/><rect x="3" y="25" width="14" height="2.5" rx="1.25" fill="var(--accent)" opacity=".45"/></svg>`
  },
  {
    id: 'dialogue', kind: 'narrative', name_en: 'Dialogue', name_uk: 'Діалог',
    desc_en: 'Character speech bubble with avatar, name and color styling. Supports alignment, nested blocks and typewriter effect.',
    desc_uk: 'Репліка персонажа з аватаром, ім\'ям та кольоровим оформленням. Підтримує вирівнювання, вкладені блоки та ефект друкарської машинки.',
    tags: ['avatar', 'nested', 'color'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 6 Q2 3 5 3 H27 Q30 3 30 6 V17 Q30 20 27 20 H15 L8 27 L9 20 H5 Q2 20 2 17 Z" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".12"/><rect x="8" y="9" width="12" height="2" rx="1" fill="var(--accent)" opacity=".85"/><rect x="8" y="13.5" width="8" height="2" rx="1" fill="var(--accent)" opacity=".55"/></svg>`
  },
  {
    id: 'callout', kind: 'narrative', name_en: 'Callout', name_uk: 'Виноска',
    desc_en: 'A coloured notice box — info, success, warning, danger or note — for tips, lore asides and system messages. Title and body accept SugarCube markup, with an optional leading icon.',
    desc_uk: 'Кольорова плашка-повідомлення — інфо, успіх, попередження, небезпека чи нотатка — для підказок, ліричних відступів та системних повідомлень. Заголовок і текст приймають розмітку SugarCube, з опційною іконкою.',
    tags: ['info', 'warning', 'tip'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="7" width="24" height="18" rx="2.5" stroke="var(--accent)" stroke-width="1.7" fill="var(--accent)" fill-opacity=".08"/><rect x="4" y="7" width="4" height="18" rx="1" fill="var(--accent)" opacity=".8"/><rect x="12" y="12" width="12" height="2" rx="1" fill="var(--accent)" opacity=".6"/><rect x="12" y="17" width="9" height="2" rx="1" fill="var(--accent)" opacity=".4"/></svg>`
  },
  {
    id: 'choice', kind: 'interaction', name_en: 'Choice', name_uk: 'Вибір',
    desc_en: 'Branching menu that lets the player pick a destination scene. Each option can have a visibility condition.',
    desc_uk: 'Меню варіантів для переходу між сценами. Кожен варіант може мати умову відображення.',
    tags: ['branch', 'condition'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="10" r="2.2" fill="var(--accent)"/><rect x="10" y="8.5" width="17" height="2.5" rx="1.25" fill="var(--accent)" opacity=".8"/><circle cx="5" cy="18" r="2.2" fill="var(--accent)" opacity=".55"/><rect x="10" y="16.5" width="13" height="2.5" rx="1.25" fill="var(--accent)" opacity=".55"/><circle cx="5" cy="26" r="2.2" fill="var(--accent)" opacity=".3"/><rect x="10" y="24.5" width="15" height="2.5" rx="1.25" fill="var(--accent)" opacity=".3"/><path d="M26 9 L29 10 L26 11" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  {
    id: 'condition', kind: 'logic', name_en: 'Condition (IF)', name_uk: 'Умова (IF)',
    desc_en: 'if / else-if / else branches with nested block support. Handles numeric range checks and array operations.',
    desc_uk: 'Гілки if / else-if / else з підтримкою вкладених блоків будь-якого типу. Підтримує числові діапазони та операції з масивами.',
    tags: ['logic', 'nested'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 2 L30 16 L16 30 L2 16 Z" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".12"/><path d="M16 30 L10 34" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><path d="M16 30 L22 34" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><rect x="11" y="13.5" width="4" height="2" rx="1" fill="var(--accent)" opacity=".9"/><rect x="11" y="17.5" width="4" height="2" rx="1" fill="var(--accent)" opacity=".6"/><rect x="17" y="13.5" width="5" height="2" rx="1" fill="var(--accent)" opacity=".4"/><rect x="17" y="17.5" width="5" height="2" rx="1" fill="var(--accent)" opacity=".25"/></svg>`
  },
  {
    id: 'for', kind: 'logic', name_en: 'For loop', name_uk: 'Цикл (For)',
    desc_en: 'Repeats its nested blocks — iterate over a collection, loop while a condition holds, or a classic for(init; cond; step).',
    desc_uk: 'Повторює вкладені блоки — перебір колекції, цикл за умовою, або класичний for(init; cond; step).',
    tags: ['loop', 'iterate', 'nested'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M25 9 A11 11 0 1 0 27 19" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M22 5 L25 9 L21 11" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11" cy="16" r="1.6" fill="var(--accent)"/><circle cx="16" cy="16" r="1.6" fill="var(--accent)" opacity=".7"/><circle cx="21" cy="16" r="1.6" fill="var(--accent)" opacity=".4"/></svg>`
  },
  {
    id: 'set', kind: 'data', name_en: 'Set variable', name_uk: 'Встановити змінну',
    desc_en: 'Assigns a value to a variable: manually, randomly, via expression, or by mapping another variable. Supports array operations (push, remove, clear).',
    desc_uk: 'Задає значення змінній: вручну, випадково, через вираз або за значенням іншої змінної. Підтримує операції з масивами (push, remove, clear).',
    tags: ['expression', 'random', 'array'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="8" width="11" height="11" rx="2.5" stroke="var(--accent)" stroke-width="1.7" fill="var(--accent)" fill-opacity=".12"/><path d="M7.5 11.5 C6 11.5 6 14 7.5 14 C9 14 9 16.5 7.5 16.5" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round"/><path d="M7.5 10.5 L7.5 11.5 M7.5 16.5 L7.5 17.5" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round"/><path d="M15 13.5 L19 13.5 M17.5 11.5 L20 13.5 L17.5 15.5" stroke="var(--accent)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><rect x="21" y="8" width="9" height="11" rx="2.5" fill="var(--accent)" fill-opacity=".22" stroke="var(--accent)" stroke-width="1.7"/><rect x="23.5" y="12" width="4" height="1.5" rx=".75" fill="var(--accent)"/><rect x="23.5" y="15" width="4" height="1.5" rx=".75" fill="var(--accent)" opacity=".6"/></svg>`
  },
  {
    id: 'set-object', kind: 'data', name_en: 'Set object', name_uk: 'Встановити об\'єкт',
    desc_en: 'Assigns a structured object to a variable — nested key/value pairs, arrays and sub-objects. The counterpart to Set variable for complex data.',
    desc_uk: 'Призначає змінній структурований об\'єкт — вкладені пари ключ/значення, масиви та під-об\'єкти. Доповнення до «Встановити змінну» для складних даних.',
    tags: ['object', 'nested', 'json'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4 Q5 4 5 8 V13 Q5 16 2 16 Q5 16 5 19 V24 Q5 28 9 28" stroke="var(--accent)" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M23 4 Q27 4 27 8 V13 Q27 16 30 16 Q27 16 27 19 V24 Q27 28 23 28" stroke="var(--accent)" stroke-width="1.7" fill="none" stroke-linecap="round"/><rect x="9.5" y="9" width="4" height="2" rx="1" fill="var(--accent)"/><rect x="15" y="9" width="7" height="2" rx="1" fill="var(--accent)" opacity=".55"/><rect x="9.5" y="14" width="4" height="2" rx="1" fill="var(--accent)"/><rect x="15" y="14" width="6" height="2" rx="1" fill="var(--accent)" opacity=".55"/><rect x="9.5" y="19" width="4" height="2" rx="1" fill="var(--accent)"/><rect x="15" y="19" width="8" height="2" rx="1" fill="var(--accent)" opacity=".55"/></svg>`
  },
  {
    id: 'time-manipulation', kind: 'data', name_en: 'Time manipulation', name_uk: 'Маніпуляція часом',
    desc_en: 'Invisibly shifts a date/time variable — add or subtract years, months, days, hours or minutes. Pairs with the Date / Time display.',
    desc_uk: 'Непомітно зсуває змінну дати/часу — додати чи відняти роки, місяці, дні, години або хвилини. Працює в парі з блоком «Дата / час».',
    tags: ['date', 'clock', 'advance'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="12" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".08"/><path d="M16 9 V16 L21 21" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 5 L7 2" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><path d="M23 5 L25 2" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><path d="M4 16 L1 16" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" opacity=".4"/><path d="M31 16 L28 16" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" opacity=".4"/></svg>`
  },
  {
    id: 'image', kind: 'media', name_en: 'Image', name_uk: 'Зображення',
    desc_en: 'Static image by URL or asset path. In bound mode the image switches based on a variable\'s value.',
    desc_uk: 'Статичне зображення за URL або шляхом до ресурсу. У режимі прив\'язки зображення змінюється залежно від значення змінної.',
    tags: ['static', 'bound'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="5" width="28" height="22" rx="3" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".08"/><circle cx="10" cy="12" r="2.5" fill="var(--accent)" opacity=".55"/><path d="M2 23 L9 15 L15 21 L20 16 L30 23" stroke="var(--accent)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="var(--accent)" fill-opacity=".18"/></svg>`
  },
  {
    id: 'image-gen', kind: 'media', name_en: 'AI Image', name_uk: 'AI-зображення',
    desc_en: 'Generates an image from a prompt via a local or cloud model (ComfyUI / Pollinations), manually or LLM-assisted. Approve a result into assets; bound mode swaps the image by a variable.',
    desc_uk: 'Генерує зображення за промптом локальною чи хмарною моделлю (ComfyUI / Pollinations), вручну або з допомогою LLM. Схвалений результат потрапляє в ресурси; режим прив\'язки змінює зображення за змінною.',
    tags: ['ai', 'comfyui', 'prompt'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 3 L15.3 8.6 L21 10 L15.3 11.4 L13 17 L10.7 11.4 L5 10 L10.7 8.6Z" fill="var(--accent)" opacity=".8"/><rect x="12" y="18" width="16" height="11" rx="2" stroke="var(--accent)" stroke-width="1.6" fill="var(--accent)" fill-opacity=".1"/><circle cx="16" cy="23" r="2" fill="var(--accent)" opacity=".55"/><circle cx="24" cy="23" r="2" fill="var(--accent)" opacity=".35"/><path d="M5 22 L11 22" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" opacity=".4"/><path d="M5 26 L11 26" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" opacity=".25"/></svg>`
  },
  {
    id: 'video', kind: 'media', name_en: 'Video', name_uk: 'Відео',
    desc_en: 'Embedded video with configurable autoplay, loop and player controls.',
    desc_uk: 'Вбудоване відео з налаштуваннями автовідтворення, повтору та відображення елементів керування.',
    tags: ['autoplay', 'loop'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="6" width="28" height="20" rx="3" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".08"/><path d="M13 11 L23 16 L13 21 Z" fill="var(--accent)" opacity=".75"/><rect x="2" y="6" width="28" height="4" rx="3" fill="var(--accent)" fill-opacity=".15"/><circle cx="7" cy="8" r="1" fill="var(--accent)" opacity=".6"/><circle cx="11" cy="8" r="1" fill="var(--accent)" opacity=".4"/><circle cx="15" cy="8" r="1" fill="var(--accent)" opacity=".25"/></svg>`
  },
  {
    id: 'audio', kind: 'media', name_en: 'Audio', name_uk: 'Аудіо',
    desc_en: 'Background music or sound effect. Immediate or delayed playback, loop, volume, stop-on-leave or persist as a global track. Can silence all other sounds before playing.',
    desc_uk: 'Фонова музика або звуковий ефект. Миттєве або відкладене відтворення, цикл, гучність, зупинка при виході зі сцени або продовження як глобальний трек.',
    tags: ['bgm', 'sfx'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12 H10 L18 5 V27 L10 20 H5 Z" stroke="var(--accent)" stroke-width="1.6" fill="var(--accent)" fill-opacity=".18"/><path d="M21.5 10 C25 12.5 25 19.5 21.5 22" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M24.5 7 C30 10.5 30 21.5 24.5 25" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".5"/></svg>`
  },
  {
    id: 'audio-gen', kind: 'media', name_en: 'AI Audio', name_uk: 'AI-аудіо',
    desc_en: 'Generates music or a track via a ComfyUI workflow (ACE Step) from a style prompt and optional lyrics. Same approve / history flow as AI Image, plus full playback controls.',
    desc_uk: 'Генерує музику чи трек через воркфлоу ComfyUI (ACE Step) за стиль-промптом та опційними текстами пісні. Той самий потік схвалення / історії, що й AI-зображення, плюс повне керування відтворенням.',
    tags: ['ai', 'music', 'acestep'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 14 H8 L14 8 V26 L8 20 H4 Z" stroke="var(--accent)" stroke-width="1.6" fill="var(--accent)" fill-opacity=".18"/><path d="M16.5 12 C19 14 19 20 16.5 22" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".7"/><path d="M24 4 L25.4 7.6 L29 9 L25.4 10.4 L24 14 L22.6 10.4 L19 9 L22.6 7.6 Z" fill="var(--accent)" opacity=".85"/><circle cx="27" cy="18" r="1.4" fill="var(--accent)" opacity=".5"/><circle cx="29.5" cy="22" r="1" fill="var(--accent)" opacity=".35"/></svg>`
  },
  {
    id: 'audio-volume', kind: 'media', name_en: 'Volume slider', name_uk: 'Гучність',
    desc_en: 'A master audio-volume slider with an optional mute button. Drives the SimpleAudio level and persists it across navigation and saves.',
    desc_uk: 'Повзунок головної гучності з опційною кнопкою вимкнення. Керує рівнем SimpleAudio і зберігає його між переходами та у збереженнях.',
    tags: ['audio', 'master', 'mute'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 13 H8 L13 8 V24 L8 19 H4 Z" fill="var(--accent)" opacity=".8"/><path d="M17 11 Q20 16 17 21" stroke="var(--accent)" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".65"/><path d="M20.5 8 Q25.5 16 20.5 24" stroke="var(--accent)" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".4"/></svg>`
  },
  {
    id: 'button', kind: 'interaction', name_en: 'Button', name_uk: 'Кнопка',
    desc_en: 'Styled button that mutates variables without navigating. Can trigger a full scene refresh after the click.',
    desc_uk: 'Стилізована кнопка, що змінює змінні без переходу між сценами. Може оновити поточну сцену після натискання.',
    tags: ['action', 'inline'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="10" width="26" height="12" rx="6" fill="var(--accent)" fill-opacity=".18" stroke="var(--accent)" stroke-width="1.8"/><rect x="9" y="14.5" width="14" height="2.5" rx="1.25" fill="var(--accent)" opacity=".75"/><path d="M5 22 Q3 28 8 30" stroke="var(--accent)" stroke-width="1.4" stroke-linecap="round" opacity=".3"/></svg>`
  },
  {
    id: 'link', kind: 'interaction', name_en: 'Link', name_uk: 'Посилання',
    desc_en: 'Styled navigation button that goes to another scene or back. Can mutate variables before navigating.',
    desc_uk: 'Стилізована кнопка для переходу в іншу сцену або повернення назад. Може змінювати змінні перед переходом.',
    tags: ['inline', 'jump'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="10" width="20" height="12" rx="6" fill="var(--accent)" fill-opacity=".15" stroke="var(--accent)" stroke-width="1.8"/><rect x="7" y="14.5" width="9" height="2.5" rx="1.25" fill="var(--accent)" opacity=".7"/><path d="M24 16 H31" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/><path d="M27.5 12.5 L31.5 16 L27.5 19.5" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  {
    id: 'menu-link', kind: 'interaction', name_en: 'Menu link', name_uk: 'Пункт меню',
    desc_en: 'A bare text link with no button chrome, recognised inside the UI-bar menu. Targets a scene, goes back, or opens the built-in saves / restart / settings dialogs.',
    desc_uk: 'Текстове посилання без оформлення кнопки, що розпізнається в меню бічної панелі. Веде на сцену, повертає назад або відкриває вбудовані діалоги збережень / перезапуску / налаштувань.',
    tags: ['menu', 'uibar', 'jump'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 22.7 H10.7 A6.7 6.7 0 0 1 10.7 9.3 H14" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M18 9.3 H21.3 A6.7 6.7 0 0 1 21.3 22.7 H18" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11 16 H21" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/></svg>`
  },
  {
    id: 'input', kind: 'interaction', name_en: 'Input field', name_uk: 'Поле вводу',
    desc_en: 'Text or number input that saves the player\'s entry to a variable. Supports writing to an array element by index.',
    desc_uk: 'Текстове або числове поле, що зберігає введене гравцем значення у змінну. Підтримує запис в елемент масиву.',
    tags: ['text', 'number', 'variable'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="9" width="28" height="14" rx="3" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".07"/><rect x="7" y="14" width="11" height="2" rx="1" fill="var(--accent)" opacity=".55"/><rect x="18" y="12.5" width="1.8" height="5" rx=".9" fill="var(--accent)" opacity=".9"/><path d="M5 9 L5 6" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" opacity=".45"/><path d="M27 9 L27 6" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" opacity=".45"/></svg>`
  },
  {
    id: 'checkbox', kind: 'interaction', name_en: 'Checkbox', name_uk: 'Прапорці',
    desc_en: 'Checkbox group in two modes: each checkbox controls its own boolean variable, or all together manage a single array.',
    desc_uk: 'Група прапорців у двох режимах: кожен прапорець керує окремою булевою змінною, або всі разом — одним масивом.',
    tags: ['boolean', 'array'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="11" height="11" rx="2" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".15"/><path d="M6 10.5 L8.5 13 L14 7.5" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="3" y="20" width="11" height="11" rx="2" stroke="var(--accent)" stroke-width="1.8" fill="none" opacity=".45"/><rect x="18" y="8" width="11" height="2.5" rx="1.25" fill="var(--accent)" opacity=".7"/><rect x="18" y="23" width="9" height="2.5" rx="1.25" fill="var(--accent)" opacity=".35"/></svg>`
  },
  {
    id: 'radio', kind: 'interaction', name_en: 'Radio', name_uk: 'Перемикачі',
    desc_en: 'Radio button group that sets a string variable to the selected option\'s value. Exactly one option is always chosen.',
    desc_uk: 'Група перемикачів, що задає рядкову змінну значенням обраного варіанту. Рівно один варіант завжди обраний.',
    tags: ['string', 'variable'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="10" r="5.5" stroke="var(--accent)" stroke-width="1.8"/><circle cx="9" cy="10" r="2.5" fill="var(--accent)"/><circle cx="9" cy="24" r="5.5" stroke="var(--accent)" stroke-width="1.8" opacity=".4"/><rect x="18" y="7.5" width="11" height="2.5" rx="1.25" fill="var(--accent)" opacity=".75"/><rect x="18" y="21.5" width="9" height="2.5" rx="1.25" fill="var(--accent)" opacity=".35"/></svg>`
  },
  {
    id: 'select', kind: 'interaction', name_en: 'Dropdown', name_uk: 'Випадний список',
    desc_en: 'A dropdown (listbox) that sets a string variable to the chosen option\'s value. The sibling of Radio for compact, many-option choices.',
    desc_uk: 'Випадний список, що задає рядкову змінну значенням обраного варіанту. Аналог «Перемикачів» для компактного вибору з багатьох опцій.',
    tags: ['listbox', 'string', 'variable'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="9" width="26" height="14" rx="2.5" stroke="var(--accent)" stroke-width="1.7" fill="var(--accent)" fill-opacity=".08"/><rect x="7" y="15" width="10" height="2" rx="1" fill="var(--accent)" opacity=".6"/><path d="M21.5 14.5 L24 17 L26.5 14.5" stroke="var(--accent)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  {
    id: 'slider', kind: 'interaction', name_en: 'Slider', name_uk: 'Повзунок',
    desc_en: 'A numeric range slider bound to a number variable — set min, max and step. Writes the value live as the player drags, with an optional value readout.',
    desc_uk: 'Числовий повзунок, прив\'язаний до числової змінної — задайте мін, макс і крок. Записує значення в реальному часі під час перетягування, з опційним показом числа.',
    tags: ['range', 'number', 'variable'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="15" width="26" height="2.5" rx="1.25" fill="var(--accent)" opacity=".4"/><circle cx="20" cy="16.25" r="4.5" fill="var(--accent)" fill-opacity=".18" stroke="var(--accent)" stroke-width="1.8"/></svg>`
  },
  {
    id: 'table', kind: 'layout', name_en: 'Table', name_uk: 'Таблиця',
    desc_en: 'Grid of cells containing text, variables, progress bars, images and buttons. Ideal for stats panels or inventory displays.',
    desc_uk: 'Сітка клітинок з текстом, змінними, прогрес-барами, зображеннями та кнопками. Ідеальна для панелей статистики чи інвентарю.',
    tags: ['grid', 'stats'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="3" width="28" height="26" rx="2.5" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".07"/><rect x="2" y="3" width="28" height="7" rx="2.5" fill="var(--accent)" fill-opacity=".2"/><path d="M2 17 H30" stroke="var(--accent)" stroke-width="1.3" opacity=".5"/><path d="M2 24 H30" stroke="var(--accent)" stroke-width="1.3" opacity=".5"/><path d="M12 10 V29" stroke="var(--accent)" stroke-width="1.3" opacity=".5"/><path d="M22 10 V29" stroke="var(--accent)" stroke-width="1.3" opacity=".5"/></svg>`
  },
  {
    id: 'progress', kind: 'data', name_en: 'Progress bar', name_uk: 'Прогрес-бар',
    desc_en: 'A meter driven by a numeric variable (HP, XP, mana…). Configurable colours or a value-interpolated gradient, optional vertical fill and a current/max readout.',
    desc_uk: 'Шкала за числовою змінною (HP, XP, мана…). Налаштовувані кольори або градієнт за значенням, опційне вертикальне заповнення та показ поточного/максимуму.',
    tags: ['meter', 'stat', 'bar'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="12" width="28" height="8" rx="4" stroke="var(--accent)" stroke-width="1.7" fill="var(--accent)" fill-opacity=".1"/><rect x="4" y="14" width="15" height="4" rx="2" fill="var(--accent)" opacity=".8"/></svg>`
  },
  {
    id: 'date-time', kind: 'data', name_en: 'Date / Time', name_uk: 'Дата / час',
    desc_en: 'Shows a date/time variable as formatted text or a graphical widget — clock, digital readout or calendar.',
    desc_uk: 'Показує змінну дати/часу як форматований текст або графічний віджет — годинник, цифрове табло чи календар.',
    tags: ['clock', 'calendar', 'format'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="12" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".1"/><path d="M16 9 V16 L21 19" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`
  },
  {
    id: 'display-object', kind: 'data', name_en: 'Object display', name_uk: 'Відображення об\'єкта',
    desc_en: 'Renders a group of variables (a character\'s stats, an item\'s fields) as a formatted display — list, table, cards, grid or bars, with a text / bar / bool / badge renderer per field. Auto-syncs with the variable group.',
    desc_uk: 'Відображає групу змінних (характеристики персонажа, поля предмета) як форматований блок — список, таблиця, картки, сітка чи бари, з рендером text / bar / bool / badge для кожного поля. Авто-синхронізується з групою змінних.',
    tags: ['stats', 'hud', 'group'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="26" height="22" rx="2.5" stroke="var(--accent)" stroke-width="1.7" fill="var(--accent)" fill-opacity=".08"/><rect x="6" y="9" width="8" height="2" rx="1" fill="var(--accent)" opacity=".75"/><rect x="18" y="9" width="8" height="2" rx="1" fill="var(--accent)" opacity=".5"/><rect x="6" y="14" width="8" height="2" rx="1" fill="var(--accent)" opacity=".75"/><rect x="18" y="14" width="8" height="2" rx="1" fill="var(--accent)" opacity=".5"/><rect x="6" y="19" width="8" height="2" rx="1" fill="var(--accent)" opacity=".75"/><rect x="18" y="19" width="8" height="2" rx="1" fill="var(--accent)" opacity=".5"/></svg>`
  },
  {
    id: 'section', kind: 'layout', name_en: 'Section', name_uk: 'Секція',
    desc_en: 'A titled container that groups nested blocks, optionally collapsible as a native disclosure. Good for organising sidebar or scene content into labelled groups.',
    desc_uk: 'Озаглавлений контейнер, що групує вкладені блоки, з опційним згортанням. Зручно для організації вмісту сцени чи бічної панелі в підписані групи.',
    tags: ['container', 'group', 'collapsible'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="26" height="22" rx="2.5" stroke="var(--accent)" stroke-width="1.7" fill="var(--accent)" fill-opacity=".08"/><rect x="3" y="5" width="26" height="6" rx="2.5" fill="var(--accent)" opacity=".35"/><rect x="7" y="15" width="18" height="2" rx="1" fill="var(--accent)" opacity=".55"/><rect x="7" y="20" width="13" height="2" rx="1" fill="var(--accent)" opacity=".4"/></svg>`
  },
  {
    id: 'tabs', kind: 'layout', name_en: 'Tabs', name_uk: 'Вкладки',
    desc_en: 'A tabbed container — a row of clickable tabs above a switchable body. The active tab is stored in a variable, so it survives navigation and saves.',
    desc_uk: 'Контейнер із вкладками — ряд клікабельних вкладок над перемиканим вмістом. Активна вкладка зберігається у змінній, тож переживає переходи та збереження.',
    tags: ['container', 'switch', 'nested'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 10 H12 L13 7 H19 L20 10 H29 V27 H3 Z" stroke="var(--accent)" stroke-width="1.7" fill="var(--accent)" fill-opacity=".12" stroke-linejoin="round"/><rect x="6" y="15" width="20" height="2" rx="1" fill="var(--accent)" opacity=".7"/><rect x="6" y="19" width="14" height="2" rx="1" fill="var(--accent)" opacity=".5"/><rect x="6" y="23" width="17" height="2" rx="1" fill="var(--accent)" opacity=".4"/></svg>`
  },
  {
    id: 'hr', kind: 'layout', name_en: 'Divider', name_uk: 'Роздільник',
    desc_en: 'Horizontal rule with configurable color, thickness and vertical margin.',
    desc_uk: 'Горизонтальна лінія з налаштуванням кольору, товщини та вертикальних відступів.',
    tags: ['layout'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="7" width="20" height="2" rx="1" fill="var(--accent)" opacity=".3"/><rect x="3" y="11.5" width="14" height="2" rx="1" fill="var(--accent)" opacity=".2"/><rect x="2" y="17" width="28" height="2.5" rx="1.25" fill="var(--accent)"/><rect x="3" y="22.5" width="18" height="2" rx="1" fill="var(--accent)" opacity=".3"/><rect x="3" y="27" width="12" height="2" rx="1" fill="var(--accent)" opacity=".2"/></svg>`
  },
  {
    id: 'spacer', kind: 'layout', name_en: 'Spacer', name_uk: 'Відступ',
    desc_en: 'Empty vertical space — a configurable gap between blocks, with no visible line (unlike a Divider).',
    desc_uk: 'Порожній вертикальний простір — налаштовуваний відступ між блоками, без видимої лінії (на відміну від роздільника).',
    tags: ['layout', 'gap'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="26" height="3" rx="1.5" fill="var(--accent)" opacity=".35"/><rect x="3" y="24" width="26" height="3" rx="1.5" fill="var(--accent)" opacity=".35"/><path d="M16 11 V21" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" opacity=".8"/><path d="M13 13 L16 10.5 L19 13" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".8"/><path d="M13 19 L16 21.5 L19 19" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".8"/></svg>`
  },
  {
    id: 'include', kind: 'layout', name_en: 'Include', name_uk: 'Включення сцени',
    desc_en: 'Inserts another scene\'s content via <<include>>. Supports a styled wrapper with size, border and background options.',
    desc_uk: 'Вставляє вміст іншої сцени через <<include>>. Підтримує обгортку з налаштуванням розміру, рамки та фону.',
    tags: ['reuse', 'embed'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="28" height="24" rx="3" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".07"/><rect x="7" y="9" width="18" height="14" rx="2" stroke="var(--accent)" stroke-width="1.5" fill="var(--accent)" fill-opacity=".14"/><rect x="10" y="13" width="8" height="1.8" rx=".9" fill="var(--accent)" opacity=".65"/><rect x="10" y="17" width="6" height="1.8" rx=".9" fill="var(--accent)" opacity=".4"/><path d="M2 4 L7 9" stroke="var(--accent)" stroke-width="1.3" opacity=".35"/><path d="M30 4 L25 9" stroke="var(--accent)" stroke-width="1.3" opacity=".35"/></svg>`
  },
  {
    id: 'function', kind: 'interaction', name_en: 'Function', name_uk: 'Виклик функції',
    desc_en: 'Executes a function-tagged scene without navigating — variables update, player stays in place. Great for reusable logic.',
    desc_uk: 'Виконує сцену-функцію без переходу — змінні оновлюються, але гравець залишається на місці. Зручно для повторюваної логіки.',
    tags: ['reuse', 'args'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="13" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".1"/><path d="M19 7 C15 7 13 10 13 13 V26" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/><path d="M9 16.5 H18" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/></svg>`
  },
  {
    id: 'popup', kind: 'interaction', name_en: 'Popup', name_uk: 'Спливаюче вікно',
    desc_en: 'Opens a SugarCube Dialog modal when the passage renders. Content comes from a scene tagged "popup". Buttons can open popups too.',
    desc_uk: 'Відкриває модальне вікно SugarCube Dialog при рендері пасажу. Вміст береться зі сцени з тегом «popup». Кнопки також можуть відкривати попапи.',
    tags: ['modal', 'dialog'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="3" width="23" height="19" rx="2.5" fill="var(--accent)" fill-opacity=".06" stroke="var(--accent)" stroke-width="1.3" opacity=".35"/><rect x="8" y="10" width="23" height="19" rx="3" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".12"/><rect x="8" y="10" width="23" height="6" rx="3" fill="var(--accent)" fill-opacity=".28"/><rect x="8" y="13" width="23" height="3" fill="var(--accent)" fill-opacity=".28"/><circle cx="27" cy="13" r="1.6" fill="var(--accent)" opacity=".75"/><rect x="12" y="20" width="11" height="2" rx="1" fill="var(--accent)" opacity=".65"/><rect x="12" y="24" width="8" height="2" rx="1" fill="var(--accent)" opacity=".4"/></svg>`
  },
  {
    id: 'raw', kind: 'system', name_en: 'Raw Code', name_uk: 'Сирий код',
    desc_en: 'Inserts arbitrary SugarCube macros or HTML verbatim into the exported passage, without any transformation.',
    desc_uk: 'Вставляє довільні макроси SugarCube або HTML безпосередньо в експортований пасаж, без жодних перетворень.',
    tags: ['sugarcube', 'html', 'escape-hatch'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 9 L3 16 L10 23" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 9 L29 16 L22 23" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6.5 L13 25.5" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" opacity=".65"/></svg>`
  },
  {
    id: 'note', kind: 'system', name_en: 'Note', name_uk: 'Нотатка',
    desc_en: 'Developer comment visible only in the editor, never exported. Useful for inline annotations and logic notes.',
    desc_uk: 'Коментар розробника, видимий лише в редакторі, не потрапляє в експорт. Зручний для позначок та пояснень логіки.',
    tags: ['comment', 'editor-only'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4 H22 L28 10 V30 H4 Z" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".08"/><path d="M22 4 L22 10 H28" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="8" y="15" width="13" height="2" rx="1" fill="var(--accent)" opacity=".6"/><rect x="8" y="20" width="10" height="2" rx="1" fill="var(--accent)" opacity=".45"/><rect x="8" y="25" width="12" height="2" rx="1" fill="var(--accent)" opacity=".3"/><circle cx="10" cy="9" r="2" fill="var(--accent)" opacity=".4"/></svg>`
  },
  {
    id: 'save', kind: 'system', name_en: 'Save', name_uk: 'Збереження',
    desc_en: 'Autosaves the player\'s progress when reached — a checkpoint. Works inside IF branches for conditional saves; optional on-screen confirmation.',
    desc_uk: 'Автоматично зберігає прогрес гравця при досягненні — чекпоінт. Працює всередині IF-гілок для умовних збережень; за бажанням показує підтвердження.',
    tags: ['save', 'checkpoint', 'autosave'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4 H22 L27 9 V26 A2 2 0 0 1 25 28 H7 A2 2 0 0 1 5 26 V6 A2 2 0 0 1 7 4 Z" stroke="var(--accent)" stroke-width="1.8" fill="var(--accent)" fill-opacity=".08"/><path d="M10 4 V11 H21 V4" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="16" width="14" height="9" rx="1" stroke="var(--accent)" stroke-width="1.6" fill="none"/><rect x="17" y="5.5" width="3" height="4" rx="0.5" fill="var(--accent)" opacity=".7"/></svg>`
  },
  {
    id: 'inventory', kind: 'game', name_en: 'Inventory', name_uk: 'Інвентар',
    desc_en: 'Displays a character\'s inventory in the scene. Supports picking up, dropping, equipping and transferring items between containers.',
    desc_uk: 'Відображає інвентар персонажа в сцені. Підтримує підбір, видачу, екіпірування та передачу предметів між контейнерами.',
    tags: ['equip', 'transfer'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="6" width="24" height="20" rx="2.5" stroke="var(--accent)" stroke-width="1.7" fill="var(--accent)" fill-opacity=".08"/><rect x="8" y="11" width="7" height="5" rx="1" fill="var(--accent)" opacity=".5"/><rect x="8" y="18" width="7" height="5" rx="1" fill="var(--accent)" opacity=".35"/><rect x="17" y="11" width="7" height="5" rx="1" fill="var(--accent)" opacity=".3"/><rect x="17" y="18" width="7" height="5" rx="1" fill="var(--accent)" opacity=".2"/><path d="M8 8 H24" stroke="var(--accent)" stroke-width="1.2" opacity=".4"/></svg>`
  },
  {
    id: 'paperdoll', kind: 'game', name_en: 'Paperdoll', name_uk: 'Папердол',
    desc_en: 'Equipment display with body part slots. Body images change based on character stats (strength, dexterity, etc.), and item appearance changes based on item variables (upgrade level, kill count, etc.).',
    desc_uk: 'Візуальний дисплей екіпірування зі слотами для частин тіла. Зображення частин тіла змінюються залежно від характеристик персонажа (сила, спритність, тощо), а вигляд айтемів — від їхніх змінних (рівень прокачки, лічильник вбивств, тощо).',
    tags: ['slots', 'dynamic', 'stats'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="16" cy="9" rx="4.5" ry="5.5" stroke="var(--accent)" stroke-width="1.6" fill="var(--accent)" fill-opacity=".12"/><path d="M8 28 C8 21 24 21 24 28" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round" fill="none"/><rect x="10" y="15" width="4" height="5" rx="1" fill="var(--accent)" opacity=".4"/><rect x="18" y="15" width="4" height="5" rx="1" fill="var(--accent)" opacity=".4"/><circle cx="16" cy="17" r="1.5" fill="var(--accent)" opacity=".6"/></svg>`
  },
  {
    id: 'container', kind: 'game', name_en: 'Container', name_uk: 'Контейнер',
    desc_en: 'Displays the contents of a container — chest, shop or loot bag. The player can pick up and place items. Contents are stored in a character or scene variable.',
    desc_uk: 'Відображає вміст контейнера — скрині, магазину або лут-мішка. Гравець може брати та класти предмети. Вміст зберігається у змінній персонажа або сцени.',
    tags: ['shop', 'loot', 'chest'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="10" width="26" height="18" rx="2.5" stroke="var(--accent)" stroke-width="1.7" fill="var(--accent)" fill-opacity=".08"/><path d="M3 15 H29" stroke="var(--accent)" stroke-width="1.3" opacity=".4"/><rect x="11" y="4" width="10" height="6" rx="2" stroke="var(--accent)" stroke-width="1.5" fill="var(--accent)" fill-opacity=".15"/><rect x="7" y="19" width="5" height="5" rx="1" fill="var(--accent)" opacity=".45"/><rect x="14" y="19" width="5" height="5" rx="1" fill="var(--accent)" opacity=".3"/><rect x="21" y="19" width="5" height="5" rx="1" fill="var(--accent)" opacity=".2"/></svg>`
  },
  {
    id: 'plugin', kind: 'plugins', name_en: 'Custom Blocks (Plugins)', name_uk: 'Власні блоки (Плагіни)',
    desc_en: 'A constructor for custom parameterised blocks. Compose a plugin from any existing blocks, define its parameters (text, number, variable, scene, colour) — and reuse it across any scene. Plugins can be exported and imported as standalone files.',
    desc_uk: 'Конструктор власних блоків із параметрами. Збирайте плагін з будь-яких існуючих блоків, налаштовуйте параметри (текст, число, змінна, сцена, колір) — і повторно використовуйте його в будь-якій сцені. Плагіни експортуються та імпортуються як окремі файли.',
    tags: ['composable', 'export'],
    svg: `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="10" width="20" height="18" rx="2.5" stroke="var(--accent)" stroke-width="1.7" fill="var(--accent)" fill-opacity=".1"/><rect x="10" y="4" width="4" height="8" rx="1" fill="var(--accent)" fill-opacity=".5" stroke="var(--accent)" stroke-width="1.3"/><rect x="18" y="4" width="4" height="8" rx="1" fill="var(--accent)" fill-opacity=".5" stroke="var(--accent)" stroke-width="1.3"/><rect x="2" y="16" width="6" height="4" rx="1" fill="var(--accent)" fill-opacity=".4" stroke="var(--accent)" stroke-width="1.3"/><rect x="24" y="16" width="6" height="4" rx="1" fill="var(--accent)" fill-opacity=".4" stroke="var(--accent)" stroke-width="1.3"/><circle cx="16" cy="19" r="2.5" fill="var(--accent)" opacity=".65"/></svg>`
  }
];

// Kinds mirror the app's AddBlockMenu categories (narrative / media / layout /
// game / data / interaction / logic / system / plugins). Labels uppercased to
// match the mono badge style.
window.PURL_BLOCK_KINDS = {
  narrative:   { en: 'NARRATIVE',   uk: 'НАРРАТИВ' },
  media:       { en: 'MEDIA',       uk: 'МЕДІА' },
  layout:      { en: 'LAYOUT',      uk: 'МАКЕТ' },
  game:        { en: 'GAME',        uk: 'ІГРОВІ' },
  data:        { en: 'DATA',        uk: 'ДАНІ' },
  interaction: { en: 'INTERACTION', uk: 'ВЗАЄМОДІЯ' },
  logic:       { en: 'LOGIC',       uk: 'ЛОГІКА' },
  system:      { en: 'SYSTEM',      uk: 'СИСТЕМНІ' },
  plugins:     { en: 'PLUGINS',     uk: 'ПЛАГІНИ' }
};
