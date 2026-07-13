/**
 * games.js — W.H. Academy
 * games.html is the Chapter Selection hub (Information Architecture
 * §5) — browsing, search, and filtering across classes/subjects, then
 * linking into each chapter's own self-contained folder
 * (games/classes/{n}/{subject}/{chapter}/chapter.html), which is where
 * actual gameplay happens. This file does NOT contain any game-engine
 * logic — that lives entirely in each chapter's own game.js, per the
 * Game Design Bible's "never redesign per chapter" rule.
 *
 * Only one chapter is wired up in this implementation:
 * games/classes/8/science/human_nervous_system/ — every other
 * class/subject is a placeholder "coming soon" card, ready to light up
 * the moment its own content.json exists, with zero engine changes.
 */

(function () {

  const AVAILABLE_CHAPTERS = [
    {
      classLevel: 8, subject: 'Science', chapterTitle: 'The Human Nervous System',
      chapterRef: 'class8/subjects/science/human_nervous_system',
      href: 'games/classes/8/science/human_nervous_system/chapter.html',
      subjectKey: 'science'
    }
  ];

  function renderChapterCard(chapter) {
    return Utils.createEl('a', {
      class: 'card card--nav card--interactive',
      href: chapter.href,
      style: `--subject-accent: var(--subject-${chapter.subjectKey}-primary); --subject-accent-tint: var(--subject-${chapter.subjectKey}-secondary);`
    }, [
      Utils.createEl('div', { class: 'card--nav__icon' }, [
        Utils.createEl('span', { 'aria-hidden': 'true', text: '🧠' })
      ]),
      Utils.createEl('div', { class: 'card--nav__body' }, [
        Utils.createEl('p', { class: 'card--nav__title', text: chapter.chapterTitle }),
        Utils.createEl('p', { class: 'card--nav__meta', text: `Class ${chapter.classLevel} · ${chapter.subject}` })
      ])
    ]);
  }

  function renderComingSoonCard(subject) {
    return Utils.createEl('div', { class: 'card', style: 'opacity:0.5;' }, [
      Utils.createEl('p', { style: 'font-weight:700;', text: subject }),
      Utils.createEl('p', { class: 'text-caption', text: 'Coming soon' })
    ]);
  }

  function renderChapterGrid(filterText) {
    const container = Utils.qs('#chapters-grid');
    container.innerHTML = '';
    const query = (filterText || '').toLowerCase();

    const matches = AVAILABLE_CHAPTERS.filter((c) =>
      !query || c.chapterTitle.toLowerCase().includes(query) || c.subject.toLowerCase().includes(query)
    );

    if (matches.length === 0) {
      container.appendChild(Utils.createEl('div', { class: 'empty-state' }, [
        Utils.createEl('p', { class: 'empty-state__title', text: 'No chapters found' }),
        Utils.createEl('p', { text: 'Try a different search term.' })
      ]));
      return;
    }
    matches.forEach((c) => container.appendChild(renderChapterCard(c)));

    if (!query) {
      ['Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'English'].forEach((s) => {
        container.appendChild(renderComingSoonCard(s));
      });
    }
  }

  function initSearchAndFilter() {
    const searchInput = Utils.qs('#chapter-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce((e) => renderChapterGrid(e.target.value), 200));
    }
  }

  document.addEventListener('wha:ready', () => {
    if (Router.currentPageName() !== 'games.html') return;
    renderChapterGrid('');
    initSearchAndFilter();
  });
})();
