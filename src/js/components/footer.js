class SiteFooter extends HTMLElement {
  connectedCallback() {
    if (this._mounted) return;
    this._mounted = true;
    this.innerHTML = '';
  }
}
customElements.define('site-footer', SiteFooter);

