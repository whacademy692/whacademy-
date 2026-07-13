/**
 * revision.js — W.H. Academy
 * Revision Center: due items, weak topics, and Wrong Answers Review —
 * reads directly from RevisionQueue.gs / WrongAnswers.gs via api.js.
 */

(function () {

  function renderDueItems(dueItems) {
    const container = Utils.qs('#due-items-list');
    container.innerHTML = '';
    if (!dueItems.length) {
      container.appendChild(Utils.createEl('div', { class: 'empty-state' }, [
        Utils.createEl('p', { class: 'empty-state__title', text: 'Nothing due right now' }),
        Utils.createEl('p', { text: 'Come back after your next practice session.' }),
        Utils.createEl('a', { class: 'btn btn--primary empty-state__action', href: 'games.html', text: 'Start a Chapter' })
      ]));
      return;
    }
    const summary = Utils.createEl('p', { class: 'text-body-sm', text: `${dueItems.length} item(s) ready for review.` });
    container.appendChild(summary);
    container.appendChild(Utils.createEl('a', { class: 'btn btn--primary btn--full', href: `games.html?mode=revision&count=${dueItems.length}`, text: 'Start Revision Session' }));
  }

  function renderWeakTopics(weakTopics) {
    const container = Utils.qs('#weak-topics-panel');
    container.innerHTML = '';
    if (!weakTopics.length) {
      container.appendChild(Utils.createEl('p', { class: 'text-body-sm', text: 'No focus areas detected yet.' }));
      return;
    }
    weakTopics.forEach((t) => {
      container.appendChild(Utils.createEl('div', { class: 'card cluster', style: 'justify-content:space-between;' }, [
        Utils.createEl('span', { text: t.topicTag.replace(/-/g, ' ') }),
        Utils.createEl('span', { class: 'badge badge--warning', text: `${Utils.formatPercent(t.accuracy)} · ${t.attemptCount} attempts` })
      ]));
    });
  }

  function renderWrongAnswers(items) {
    const container = Utils.qs('#wrong-answers-list');
    container.innerHTML = '';
    if (!items.length) {
      container.appendChild(Utils.createEl('p', { class: 'text-body-sm', text: 'Nothing here yet — great work!' }));
      return;
    }
    items.forEach((item) => {
      container.appendChild(Utils.createEl('div', { class: 'card' }, [
        Utils.createEl('p', { style: 'font-weight:700;', text: item.topicTag }),
        Utils.createEl('p', { class: 'text-caption', text: Utils.formatFriendlyDate(item.timestamp) })
      ]));
    });
  }

  async function loadRevisionCenter() {
    try {
      const [dueResult, weakResult, wrongResult] = await Promise.all([
        Api.revision.dueItems(), Api.wrongAnswers.weakTopics(), Api.wrongAnswers.list({})
      ]);
      renderDueItems(dueResult.dueItems);
      renderWeakTopics(weakResult.weakTopics);
      renderWrongAnswers(wrongResult.wrongAnswers);
      Animations.revealContent(Utils.qs('#revision-skeleton'), Utils.qs('#revision-content'));
    } catch (err) {
      Notifications.error('Could not load your Revision Center.');
    }
  }

  document.addEventListener('wha:ready', () => {
    if (Router.currentPageName() !== 'revision.html') return;
    loadRevisionCenter();
  });
})();
