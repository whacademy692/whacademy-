/**
 * dashboard.js — W.H. Academy
 * Renders dashboard.html from the dashboard/compose payload
 * (Dashboard.gs): { recommendation, xpTotal, streak, revisionDueCount,
 * weakTopics, recentAchievements, recentCertificates }.
 */

(function () {

  const RECOMMENDATION_COPY = {
    1: { title: 'Continue where you left off', cta: 'Continue', href: (data) => `games.html?chapter=${encodeURIComponent(data.chapterRef)}` },
    2: { title: 'Time to revise', cta: 'Start Revision', href: () => 'revision.html' },
    3: { title: 'A topic worth practicing', cta: 'Practice Now', href: () => 'games.html' },
    4: { title: 'Ready for something new', cta: 'Browse Chapters', href: () => 'games.html' }
  };

  function renderSkeleton() {
    Utils.qs('#dashboard-content').hidden = true;
    Utils.qs('#dashboard-skeleton').hidden = false;
  }

  /**
   * Shows WHO is signed in — name, class and Student ID — plus a one-tap
   * "Not you? Log out".
   *
   * Siblings routinely share one device and one parent email, each with their
   * own Student ID. Before this, nothing on screen said which child was signed
   * in: if one forgot to log out, the next would land silently in the wrong
   * account and start earning XP there, with no way to notice. This is the
   * cheap, high-value part of proper multi-profile support.
   */
  function renderIdentity(profile) {
    const banner = Utils.qs('#identity-banner');
    if (!banner || !profile || !profile.studentId) return;

    const name = (profile.fullName || '').trim();
    const initial = name ? name.charAt(0).toUpperCase() : '?';

    Utils.qs('#identity-initial').textContent = initial;
    Utils.qs('#identity-name').textContent = name || 'Signed in';

    const meta = profile.classLevel
      ? 'Class ' + profile.classLevel + '  \u00b7  ' + profile.studentId
      : profile.studentId;
    Utils.qs('#identity-meta').textContent = meta;

    banner.hidden = false;
  }

  function renderRecommendation(recommendation) {
    const card = Utils.qs('#recommendation-card');
    const copy = RECOMMENDATION_COPY[recommendation.tier] || RECOMMENDATION_COPY[4];
    card.querySelector('.card--nav__title').textContent = copy.title;
    const subtitleEl = card.querySelector('.card--nav__meta');
    if (recommendation.tier === 2) {
      subtitleEl.textContent = `${recommendation.data.dueCount} item(s) due for revision`;
    } else if (recommendation.tier === 3 && recommendation.data.topic) {
      subtitleEl.textContent = `Focus area: ${recommendation.data.topic.topicTag}`;
    } else if (recommendation.tier === 1 && recommendation.data.chapterRef) {
      subtitleEl.textContent = recommendation.data.chapterRef.split('/').pop().replace(/_/g, ' ');
    } else {
      subtitleEl.textContent = 'Explore your next chapter';
    }
    const ctaBtn = card.querySelector('.btn');
    ctaBtn.textContent = copy.cta;
    ctaBtn.href = copy.href(recommendation.data);
  }

  function renderStats(data) {
    const xpEl = Utils.qs('#stat-xp .card--stat__value');
    Animations.countUp(xpEl, 0, data.xpTotal);

    const streakEl = Utils.qs('#stat-streak .card--stat__value');
    streakEl.textContent = data.streak.currentStreak;
    Utils.qs('#stat-streak .card--stat__label').textContent = Utils.pluralize(data.streak.currentStreak, 'day streak');

    Utils.qs('#stat-revision .card--stat__value').textContent = data.revisionDueCount;
  }

  function renderWeakTopics(weakTopics) {
    const container = Utils.qs('#weak-topics-list');
    container.innerHTML = '';
    if (!weakTopics || weakTopics.length === 0) {
      container.appendChild(Utils.createEl('p', { class: 'text-body-sm', text: 'No focus areas right now — nice work.' }));
      return;
    }
    weakTopics.forEach((topic) => {
      const row = Utils.createEl('a', { class: 'card card--interactive cluster', href: `revision.html?topic=${encodeURIComponent(topic.topicTag)}`, style: 'justify-content:space-between;' }, [
        Utils.createEl('span', { text: topic.topicTag.replace(/-/g, ' ') }),
        Utils.createEl('span', { class: 'badge badge--warning', text: Utils.formatPercent(topic.accuracy) })
      ]);
      container.appendChild(row);
    });
  }

  function renderAchievements(achievements) {
    const container = Utils.qs('#recent-achievements');
    container.innerHTML = '';
    if (!achievements || achievements.length === 0) {
      container.appendChild(Utils.createEl('p', { class: 'text-body-sm', text: 'Complete a chapter to earn your first achievement.' }));
      return;
    }
    achievements.forEach((a) => {
      container.appendChild(Utils.createEl('div', { class: 'achievement-card' }, [
        Utils.createEl('div', { class: 'badge badge--info', text: a.category }),
        Utils.createEl('p', { class: 'achievement-card__title', text: a.achievementId.replace(/-/g, ' ') })
      ]));
    });
  }

  function renderCertificates(certificates) {
    const container = Utils.qs('#recent-certificates');
    container.innerHTML = '';
    if (!certificates || certificates.length === 0) {
      container.appendChild(Utils.createEl('p', { class: 'text-body-sm', text: 'Finish a chapter to earn your first certificate.' }));
      return;
    }
    certificates.forEach((c) => {
      container.appendChild(Utils.createEl('a', { class: 'card card--interactive', href: 'achievements.html#certificates' }, [
        Utils.createEl('p', { style: 'font-weight:700;', text: c.scopeRef.split('/').pop().replace(/_/g, ' ') }),
        Utils.createEl('p', { class: 'text-caption', text: Utils.formatFriendlyDate(c.issuedAt) })
      ]));
    });
  }

  /**
   * MY SUBJECTS — the enrolledScope-gated content list.
   *
   * The student sees only their class and (for Class 9-12) only their chosen
   * subjects. Each chapter shows exactly the buttons that are wired for it:
   * Notes, Quiz, Game. Chapters with nothing wired yet read "Coming soon".
   */
  function renderMySubjects(profile) {
    const section = Utils.qs('#my-subjects-section');
    const list = Utils.qs('#my-subjects-list');
    const intro = Utils.qs('#my-subjects-intro');
    const tag = Utils.qs('#my-subjects-tag');
    if (!section || !list) return;

    // Guard: the registry + scope modules must be present.
    if (!window.WHA_Scope || !window.WHA_CONTENT) { section.hidden = true; return; }

    const scope = window.WHA_Scope.parse(profile && profile.enrolledScope);
    const subjects = window.WHA_Scope.allowedSubjects(scope, window.WHA_CONTENT);

    if (!subjects.length) {
      // Enrolled class/subjects have no content in the registry yet (e.g. Class
      // 10-12), OR the scope was empty. Either way, show nothing rather than
      // leaking other classes' material.
      section.hidden = true;
      return;
    }
    section.hidden = false;

    const subjectNames = subjects.map((x) => x.name);
    if (intro) {
      intro.textContent = scope.fullClass
        ? 'You are enrolled in Class ' + scope.classLevel + '. Everything below is yours to explore.'
        : 'You have enrolled for these subjects: ' + subjectNames.join(', ') + '.';
    }
    if (tag) tag.textContent = 'Class ' + (scope.classLevel || '');

    list.innerHTML = '';
    subjects.forEach((subject) => {
      list.appendChild(renderSubjectBlock(subject));
    });
  }

  function renderSubjectBlock(subject) {
    const wrap = Utils.createEl('div', { class: 'card', style: 'padding: var(--space-4);' });

    wrap.appendChild(Utils.createEl('div', { class: 'cluster', style: 'justify-content:space-between; align-items:baseline; margin-bottom: var(--space-3);' }, [
      Utils.createEl('h3', { style: 'margin:0;', text: subject.name }),
      Utils.createEl('span', { class: 'text-caption', text: subject.chapters.length + ' chapters' })
    ]));

    const chaptersWrap = Utils.createEl('div', { class: 'stack-sm' });
    subject.chapters.forEach((ch) => chaptersWrap.appendChild(renderChapterRow(ch)));
    wrap.appendChild(chaptersWrap);
    return wrap;
  }

  function renderChapterRow(chapter) {
    const row = Utils.createEl('div', {
      class: 'cluster',
      style: 'justify-content:space-between; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--color-border); flex-wrap: wrap;'
    });

    const label = chapter.n ? ('Ch ' + chapter.n + '  ·  ' + chapter.title) : chapter.title;
    row.appendChild(Utils.createEl('span', { style: 'font-weight:600; flex:1 1 12rem;', text: label }));

    const actions = Utils.createEl('div', { class: 'cluster', style: 'gap: var(--space-2); flex-wrap: wrap;' });
    let any = false;

    if (chapter.game) {
      any = true;
      actions.appendChild(Utils.createEl('a', {
        class: 'btn btn--primary btn--sm', href: chapter.game,
        'aria-label': 'Play ' + chapter.title
      }, [Utils.createEl('span', { text: 'Play' })]));
    }
    if (chapter.notes) {
      any = true;
      actions.appendChild(Utils.createEl('a', {
        class: 'btn btn--secondary btn--sm', href: chapter.notes,
        target: '_blank', rel: 'noopener', 'aria-label': 'Notes for ' + chapter.title
      }, [Utils.createEl('span', { text: 'Notes' })]));
    }
    if (chapter.quiz) {
      any = true;
      actions.appendChild(Utils.createEl('a', {
        class: 'btn btn--secondary btn--sm', href: chapter.quiz,
        target: '_blank', rel: 'noopener', 'aria-label': 'Quiz for ' + chapter.title
      }, [Utils.createEl('span', { text: 'Quiz' })]));
    }
    if (!any) {
      actions.appendChild(Utils.createEl('span', { class: 'text-caption', text: 'Coming soon' }));
    }

    row.appendChild(actions);
    return row;
  }

  function renderError() {
    Utils.qs('#dashboard-skeleton').hidden = true;
    Utils.qs('#dashboard-error').hidden = false;
  }

  async function loadDashboard() {
    renderSkeleton();
    try {
      const data = await Api.dashboard.compose();
      Storage.setCachedDashboard(data);
      renderIdentity(data.profile);
      renderRecommendation(data.recommendation);
      renderStats(data);
      renderWeakTopics(data.weakTopics);
      renderAchievements(data.recentAchievements);
      renderCertificates(data.recentCertificates);
      renderMySubjects(data.profile);
      Animations.revealContent(Utils.qs('#dashboard-skeleton'), Utils.qs('#dashboard-content'));
    } catch (err) {
      // Fall back to cache if we have one — never show a blank/broken
      // dashboard just because the network hiccuped.
      const cached = Storage.getCachedDashboard();
      if (cached && cached.data) {
        renderIdentity(cached.data.profile);
        renderRecommendation(cached.data.recommendation);
        renderStats(cached.data);
        renderWeakTopics(cached.data.weakTopics);
        renderAchievements(cached.data.recentAchievements);
        renderCertificates(cached.data.recentCertificates);
        renderMySubjects(cached.data.profile);
        Animations.revealContent(Utils.qs('#dashboard-skeleton'), Utils.qs('#dashboard-content'));
        Notifications.info('Showing your last saved progress — reconnect to refresh.');
      } else {
        renderError();
      }
    }
  }

  document.addEventListener('wha:ready', () => {
    if (Router.currentPageName() !== 'dashboard.html') return;
    loadDashboard();
    const retryBtn = Utils.qs('#dashboard-retry');
    if (retryBtn) retryBtn.addEventListener('click', loadDashboard);
  });
})();
