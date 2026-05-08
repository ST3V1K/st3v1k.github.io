// ── GitHub Activity Fetcher ──────────────────────────────────────────────
const USERNAME = 'ST3V1K';
const MAX_EVENTS = 10;

const EVENT_ICONS = {
    PushEvent: '⬆',
    PullRequestEvent: '⤵',
    IssuesEvent: '◎',
    IssueCommentEvent: '◈',
    CreateEvent: '✦',
    DeleteEvent: '✕',
    ForkEvent: '⑂',
    WatchEvent: '★',
    ReleaseEvent: '◆',
    PullRequestReviewEvent: '✔',
    PullRequestReviewCommentEvent: '◇',
};

function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
}

function describeEvent(e) {
    const repo = e.repo.name;
    const repoUrl = `https://github.com/${repo}`;
    const p = e.payload;

    switch (e.type) {
        case 'PushEvent': {
            const commitCount = e._commitCount ?? 1;
            const branch = (p.ref || '').replace('refs/heads/', '');
            return {
                label: `push · ${branch}`,
                title: `Pushed ${commitCount} commit${commitCount !== 1 ? 's' : ''} to ${branch}`,
                url: repoUrl + `/commits/${branch}`,
                tag: repo.split('/')[1],
            };
        }
        case 'PullRequestEvent': {
            const pr = p.pull_request;
            return {
                label: `PR ${p.action} · #${p.number}`,
                title: pr?.title ?? 'Pull request',
                url: pr?.html_url ?? repoUrl,
                tag: repo.split('/')[1],
            };
        }
        case 'IssuesEvent': {
            const iss = p.issue;
            return {
                label: `issue ${p.action} · #${p.issue?.number}`,
                title: iss?.title ?? 'Issue',
                url: iss?.html_url ?? repoUrl,
                tag: repo.split('/')[1],
            };
        }
        case 'IssueCommentEvent': {
            return {
                label: `comment on #${p.issue?.number}`,
                title: p.comment?.body?.split('\n')[0]?.slice(0, 80) ?? 'Commented on issue',
                url: p.comment?.html_url ?? repoUrl,
                tag: repo.split('/')[1],
            };
        }
        case 'CreateEvent': {
            return {
                label: `created ${p.ref_type}`,
                title: p.ref ? `${p.ref_type} "${p.ref}"` : `Created ${p.ref_type} in ${repo}`,
                url: repoUrl,
                tag: repo.split('/')[1],
            };
        }
        case 'ForkEvent': {
            return {
                label: 'fork',
                title: `Forked ${repo}`,
                url: p.forkee?.html_url ?? repoUrl,
                tag: repo.split('/')[1],
            };
        }
        case 'WatchEvent': {
            return {
                label: 'starred',
                title: `Starred ${repo}`,
                url: repoUrl,
                tag: repo.split('/')[1],
            };
        }
        case 'PullRequestReviewCommentEvent': {
            return {
                label: `review comment · PR #${p.pull_request?.number}`,
                title: p.comment?.body?.split('\n')[0]?.slice(0, 80) ?? 'Commented on PR review',
                url: p.comment?.html_url ?? repoUrl,
                tag: repo.split('/')[1],
            };
        }
        case 'PullRequestReviewEvent': {
            return {
                label: `review · PR #${p.pull_request?.number}`,
                title: p.pull_request?.title ?? 'Pull request review',
                url: p.review?.html_url ?? repoUrl,
                tag: repo.split('/')[1],
            };
        }
        case 'ReleaseEvent': {
            return {
                label: `release ${p.action}`,
                title: p.release?.name ?? p.release?.tag_name ?? 'Release',
                url: p.release?.html_url ?? repoUrl,
                tag: repo.split('/')[1],
            };
        }
        default: {
            return {
                label: e.type.replace('Event', '').toLowerCase(),
                title: repo,
                url: repoUrl,
                tag: repo.split('/')[1],
            };
        }
    }
}

function renderEvents(events) {
    const list = document.getElementById('oss-list');

    if (!events.length) {
        list.innerHTML = `<div class="oss-loading">No public activity found.</div>`;
        return;
    }

    list.innerHTML = events.slice(0, MAX_EVENTS).map(e => {
        const icon = EVENT_ICONS[e.type] ?? '·';
        const d = describeEvent(e);
        const ago = timeAgo(e.created_at);
        const repo = e.repo.name;
        const repoUrl = `https://github.com/${repo}`;

        return `
        <a href="${d.url}" class="oss-item" target="_blank" rel="noopener">
          <span class="oss-pr">${icon} ${d.label}</span>
          <span class="oss-title">
            <strong>${d.tag}</strong>
            <span> — ${d.title}</span>
          </span>
          <span class="oss-meta">
            <span class="oss-repo-link">${repo}</span>
            <span class="oss-time">${ago}</span>
          </span>
        </a>`;
    }).join('');
}

function showToast(msg, duration = 4000) {
    const toast = document.getElementById('toast');
    const label = document.getElementById('toast-msg');
    if (!toast || !label) return;
    label.textContent = msg;
    toast.classList.remove('toast-hide');
    toast.classList.add('toast-show');
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
    }, duration);
}

function renderError(msg) {
    document.getElementById('oss-list').innerHTML =
        `<div class="oss-loading oss-error">${msg}</div>`;
    showToast(msg);
}

async function fetchCommitCount(repoName, before, head) {
    const ZERO = '0000000000000000000000000000000000000000';
    if (!before || !head || before === ZERO) return 1;
    try {
        const r = await fetch(
            `https://api.github.com/repos/${repoName}/compare/${before}...${head}`, {
                headers: {
                    'Accept': 'application/vnd.github+json'
                }
            }
        );
        if (!r.ok) return 1;
        const data = await r.json();
        return data.total_commits ?? data.commits?.length ?? 1;
    } catch {
        return 1;
    }
}

async function loadActivity() {
    try {
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const all = [];

        for (let page = 1; page <= 10; page++) {
            const r = await fetch(
                `https://api.github.com/users/${USERNAME}/events/public?per_page=30&page=${page}`, {
                    headers: {
                        'Accept': 'application/vnd.github+json'
                    }
                }
            );
            if (r.status === 403) {
                showToast('GitHub API rate limit reached — try again shortly.');
                break;
            }
            if (!r.ok) {
                showToast(`GitHub API error: ${r.status}`);
                break;
            }
            const events = await r.json();
            if (!events.length) break;

            const recent = events.filter(e => new Date(e.created_at).getTime() >= cutoff);
            all.push(...recent);

            // If some events on this page were already older than 90 days, no need to go further
            if (recent.length < events.length) break;
        }

        // Resolve commit counts for all push events via compare API
        const pushEvents = all.filter(e => e.type === 'PushEvent');
        await Promise.all(
            pushEvents.map(async e => {
                e._commitCount = await fetchCommitCount(
                    e.repo.name, e.payload.before, e.payload.head
                );
            })
        );

        // Count all contributions
        let count = 0;
        for (const e of all) {
            switch (e.type) {
                case 'PushEvent':
                    count += e._commitCount ?? 1;
                    break;
                case 'PullRequestEvent':
                    if (['opened', 'closed', 'merged'].includes(e.payload?.action)) count++;
                    break;
                case 'IssuesEvent':
                    if (['opened', 'closed'].includes(e.payload?.action)) count++;
                    break;
                case 'IssueCommentEvent':
                case 'PullRequestReviewEvent':
                case 'PullRequestReviewCommentEvent':
                case 'CommitCommentEvent':
                    count++;
                    break;
                case 'CreateEvent':
                    if (['repository', 'branch', 'tag'].includes(e.payload?.ref_type)) count++;
                    break;
                case 'ReleaseEvent':
                    count++;
                    break;
                default:
                    break;
            }
        }

        const el = document.getElementById('contrib-count');
        if (el) el.textContent = count > 0 ? count : '—';

        renderEvents(all);
    } catch (err) {
        renderError('Could not reach GitHub API.');
    }
}

loadActivity();
