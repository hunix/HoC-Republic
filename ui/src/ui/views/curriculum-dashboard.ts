import { html, type TemplateResult, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { EducationStatus } from "../republic-types.ts";
import { icon } from "../icons.js";

@customElement("hoc-curriculum-dashboard")
export class CurriculumDashboard extends LitElement {
  @property({ type: Object })
  education: EducationStatus | null = null;

  protected createRenderRoot() {
    return this; // Use light DOM to inherit global styles
  }

  render(): TemplateResult {
    if (!this.education || !this.education.curriculum) {
      return html`
        <div class="republic-view republic-curriculum">
          <div class="republic-hero republic-hero--curriculum">
            <div class="republic-hero__header">
              <h2 class="republic-hero__title">${icon("book")} Curriculum & Skills Matrix</h2>
            </div>
          </div>
          <div class="republic-card"><p class="republic-card__empty">No curriculum data available yet.</p></div>
        </div>
      `;
    }

    const { curriculum } = this.education;

    // Sort domains by highest total citizen count
    const sortedDomains = [...curriculum].toSorted((a, b) => {
      const sumA = a.skills.reduce((sum, s) => sum + s.citizenCount, 0);
      const sumB = b.skills.reduce((sum, s) => sum + s.citizenCount, 0);
      return sumB - sumA;
    });

    return html`
      <div class="republic-view republic-curriculum">
        <!-- Hero -->
        <div class="republic-hero republic-hero--curriculum">
          <div class="republic-hero__header">
            <h2 class="republic-hero__title">${icon("book")} Curriculum & Skills Matrix</h2>
          </div>
          <p class="republic-hero__subtitle" style="margin-top: 8px; opacity: 0.8;">
            A global registry of all simulation skills and disciplines currently known or being researched by Republic citizens.
          </p>
        </div>

        <div class="republic-grid republic-grid--masonry" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; align-items: start;">
          ${sortedDomains.map((domainObj) => {
            const hasLearners = domainObj.skills.some((s) => s.citizenCount > 0);
            return html`
              <div class="republic-card" style="opacity: ${hasLearners ? "1" : "0.6"}; border-top: 3px solid var(--accent);">
                <div class="republic-card__header">
                  <h3 style="text-transform: capitalize; margin: 0;">${domainObj.domain}</h3>
                </div>
                <div class="republic-card__content" style="padding-top: 8px;">
                  <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${domainObj.skills.map(
                      (skill) => html`
                      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; background: var(--bg-elevated); padding: 4px 8px; border-radius: var(--radius-sm);">
                        <span style="font-weight: 500;">${skill.name}</span>
                        ${
                          skill.citizenCount > 0
                            ? html`<span class="republic-badge republic-badge--success" style="font-size: 0.7rem;">${skill.citizenCount} citizens</span>`
                            : html`
                                <span class="republic-badge" style="font-size: 0.7rem">Undiscovered</span>
                              `
                        }
                      </div>
                    `,
                    )}
                  </div>
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }
}
