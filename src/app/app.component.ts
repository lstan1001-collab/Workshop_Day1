import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { LinkRecord, LinksApiService } from './links-api.service';

const httpUrlValidator: ValidatorFn = (control) => {
  const value = String(control.value ?? '').trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  readonly links = signal<LinkRecord[]>([]);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly loadError = signal('');
  readonly formError = signal('');
  readonly createdShortUrl = signal('');

  readonly form = new FormGroup({
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, httpUrlValidator]
    })
  });

  constructor(private readonly linksApi: LinksApiService) {}

  ngOnInit(): void {
    this.refreshLinks();
  }

  refreshLinks(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.linksApi.getLinks()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (links) => this.links.set(links),
        error: () => this.loadError.set('Could not load links. Check that the Snip API is running and try again.')
      });
  }

  submit(): void {
    if (this.submitting()) return;

    this.form.markAllAsTouched();
    this.formError.set('');
    this.createdShortUrl.set('');
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.linksApi.createLink(this.form.controls.url.value.trim())
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (created) => {
          this.createdShortUrl.set(created.shortUrl);
          this.form.reset();
          this.refreshLinks();
        },
        error: (error: unknown) => this.formError.set(this.getErrorMessage(error))
      });
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Could not reach the Snip API. Check that it is running and try again.';
      const body: unknown = error.error;
      const message = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
      if (typeof message === 'string') return message;
    }

    return 'Something went wrong while creating your short link. Please try again.';
  }
}
