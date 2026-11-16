import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { LinkRecord } from './links-api.service';

describe('AppComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('rejects invalid URLs before submitting', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);

    fixture.componentInstance.form.controls.url.setValue('ftp://example.com');
    fixture.componentInstance.submit();

    expect(fixture.componentInstance.form.controls.url.invalid).toBeTrue();
    http.expectNone({ method: 'POST', url: 'http://localhost:3000/api/links' });
  });

  it('creates a link and refreshes the table', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);

    const created: LinkRecord = {
      code: 'a1b2c3',
      url: 'https://example.com/page',
      shortUrl: 'http://localhost:3000/a1b2c3',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z'
    };
    fixture.componentInstance.form.controls.url.setValue(created.url);
    fixture.componentInstance.submit();
    http.expectOne({ method: 'POST', url: 'http://localhost:3000/api/links' }).flush(created);
    http.expectOne('http://localhost:3000/api/links').flush([created]);
    fixture.detectChanges();

    expect(fixture.componentInstance.createdShortUrl()).toBe(created.shortUrl);
    expect(fixture.componentInstance.links()).toEqual([created]);
    expect(fixture.nativeElement.querySelector('tbody')?.textContent).toContain(created.url);
  });
});
