import { html, type TemplateResult } from "lit";
import type { EducationStatus, Course } from "../republic-types.ts";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export interface EducationDashboardProps {
  loading: boolean;
  education: EducationStatus | null;
  onRefresh: () => void;
}

// ─── Main Render ──────────────────────────────────────────────────

export function renderEducationDashboard(props: EducationDashboardProps): TemplateResult {
  const { loading, education } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading education data…</p>
      </div>
    `;
  }

  if (!education) {
    return html`
      <div class="republic-card"><p class="republic-card__empty">Education system not yet active</p></div>
    `;
  }

  const activeCourses = education.courses.filter((c) => (c.enrolled ?? 0) > 0);
  const avgDifficulty =
    education.courses.length > 0
      ? (
          education.courses.reduce((s, c) => s + c.difficulty, 0) / education.courses.length
        ).toFixed(1)
      : "—";

  return html`
    <div class="republic-view republic-education">
      <!-- Hero -->
      <div class="republic-hero republic-hero--edu">
        <div class="republic-hero__header">
          <h2 class="republic-hero__title">${icon("book")} Education Dashboard</h2>
          <button type="button" class="republic-btn republic-btn--sm" @click=${props.onRefresh}>↻ Refresh</button>
        </div>
      </div>

      <!-- KPIs -->
      <div class="republic-metrics republic-metrics--grid">
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${education.courses.length}</div>
          <div class="republic-metric__label">Total Courses</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${activeCourses.length}</div>
          <div class="republic-metric__label">Active Courses</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${education.totalGraduations.toLocaleString()}</div>
          <div class="republic-metric__label">Graduations</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${avgDifficulty}</div>
          <div class="republic-metric__label">Avg Difficulty</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${
            education.curriculum
              ? education.curriculum.reduce((sum, d) => sum + d.skills.filter((s) => s.citizenCount > 0).length, 0)
              : 0
          }</div>
          <div class="republic-metric__label">Unique Skills Discovered</div>
        </div>
      </div>

      <!-- Course Cards -->
      ${renderCourseList(education.courses)}
    </div>
  `;
}

// ─── Course List ──────────────────────────────────────────────────

function renderCourseList(courses: Course[]): TemplateResult {
  if (courses.length === 0) {
    return html`
      <div class="republic-card"><p class="republic-card__empty">No courses available</p></div>
    `;
  }

  // Group by domain
  const byDomain = new Map<string, Course[]>();
  for (const c of courses) {
    const domain = c.domain || "General";
    if (!byDomain.has(domain)) {
      byDomain.set(domain, []);
    }
    byDomain.get(domain)!.push(c);
  }

  return html`
    ${[...byDomain.entries()].map(
      ([domain, list]) => html`
        <div class="republic-card republic-card--wide">
          <div class="republic-card__header">
            <h3>${domain}</h3>
            <span class="republic-badge">${list.length} courses</span>
          </div>
          <div class="republic-table-wrap">
            <table class="republic-table">
              <thead>
                <tr>
                  <th>Course</th><th>Difficulty</th><th>Enrolled</th><th>Capacity</th><th>Duration</th>
                </tr>
              </thead>
              <tbody>
                ${list.map(
                  (c) => html`<tr>
                    <td><strong>${c.name}</strong></td>
                    <td>${renderDifficultyBadge(c.difficulty)}</td>
                    <td>${c.enrolled}/${c.maxEnrollment}</td>
                    <td>
                      <div class="republic-gauge republic-gauge--sm">
                        <div class="republic-gauge__fill" style="width:${Math.round((c.enrolled / Math.max(1, c.maxEnrollment)) * 100)}%"></div>
                      </div>
                    </td>
                    <td>${c.duration} ticks</td>
                  </tr>`,
                )}
              </tbody>
            </table>
          </div>
        </div>
      `,
    )}
  `;
}

function renderDifficultyBadge(d: number): TemplateResult {
  const label = d <= 2 ? "Easy" : d <= 4 ? "Medium" : d <= 7 ? "Hard" : "Expert";
  const cls =
    d <= 2
      ? "republic-badge--success"
      : d <= 4
        ? "republic-badge--info"
        : d <= 7
          ? "republic-badge--warning"
          : "republic-badge--danger";
  return html`<span class="republic-badge ${cls}">${label} (${d})</span>`;
}
