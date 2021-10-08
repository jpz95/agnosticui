import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import * as i0 from "@angular/core";
import * as i1 from "@angular/common";
export class ProgressComponent {
    constructor() {
        this.value = 0;
        this.max = 100;
    }
    get classes() {
        var _a;
        console.log(this);
        let klasses = ['progress', ((_a = this.css) === null || _a === void 0 ? void 0 : _a.length) ? `${this.css}` : ''];
        klasses = klasses.filter((klass) => klass.length);
        return klasses.join(' ');
    }
}
ProgressComponent.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "12.2.8", ngImport: i0, type: ProgressComponent, deps: [], target: i0.ɵɵFactoryTarget.Component });
ProgressComponent.ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "12.0.0", version: "12.2.8", type: ProgressComponent, selector: "ag-progress", inputs: { value: "value", max: "max", css: "css" }, ngImport: i0, template: `<progress [ngClass]="classes" [attr.value]="value" [attr.max]="max"></progress>`, isInline: true, styles: [".progress{-webkit-appearance:none;height:var(--agnosticui-progress-height, 10px);width:100%;border:none;background-color:var(--agnosticui-progress-background, #ededed);border-radius:var(--agnosticui-progress-radius, 10px)}.progress[value]::-webkit-progress-bar{background-color:var(--agnosticui-progress-background, #ededed);border-radius:var(--agnosticui-progress-radius, 10px)}.progress[value]::-webkit-progress-value{background-color:var(--agnosticui-progress-fill-color, #077acb);border-radius:var(--agnosticui-progress-radius, 10px)}.progress[value]::-moz-progress-bar{background-color:var(--agnosticui-progress-fill-color, #077acb);border-radius:var(--agnosticui-progress-radius, 10px)}.progress[value]::-ms-fill{background-color:var(--agnosticui-progress-fill-color, #077acb);border-radius:var(--agnosticui-progress-radius, 10px)}\n"], directives: [{ type: i1.NgClass, selector: "[ngClass]", inputs: ["class", "ngClass"] }], changeDetection: i0.ChangeDetectionStrategy.OnPush });
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "12.2.8", ngImport: i0, type: ProgressComponent, decorators: [{
            type: Component,
            args: [{
                    selector: 'ag-progress',
                    template: `<progress [ngClass]="classes" [attr.value]="value" [attr.max]="max"></progress>`,
                    styleUrls: ['./progress.css'],
                    changeDetection: ChangeDetectionStrategy.OnPush,
                }]
        }], propDecorators: { value: [{
                type: Input
            }], max: [{
                type: Input
            }], css: [{
                type: Input
            }] } });
//# sourceMappingURL=progress.component.js.map