# Live Deployment Checklist

## 1. Files to remove from live server first

- Delete `/public_html/wp-styles.php`
- Delete `/public_html/wp-config.bak-a2.php` if it exists
- Delete `/public_html/wp-content/plugins/fix/`

## 2. Fix `.htaccess`

Remove these malicious lines from `/public_html/.htaccess`:

```apache
RewriteEngine On
RewriteCond %{HTTP_USER_AGENT} Google [NC]
RewriteCond %{REQUEST_URI} ^/$
RewriteRule ^$ wp-styles.php [L]
```

Keep the normal WordPress rewrite block and Wordfence WAF block.

## 3. Replace WordPress core

- Download a fresh WordPress package matching your current major version
- Replace these folders/files on live server:
  - `/public_html/wp-admin/`
  - `/public_html/wp-includes/`
  - all root core PHP files like `index.php`, `wp-login.php`, `xmlrpc.php`, `wp-settings.php`
- Do not overwrite `/public_html/wp-content/`
- Do not overwrite `/public_html/wp-config.php`

## 4. Upload cleaned content

Use the cleaned local backup at `/Users/guru/Downloads/sta/stra/`

Safe to upload after review:
- `/Users/guru/Downloads/sta/stra/wp-content/themes/generatepress/`
- `/Users/guru/Downloads/sta/stra/wp-content/plugins/`
- `/Users/guru/Downloads/sta/stra/landing/`
- `/Users/guru/Downloads/sta/stra/brand-landing/`
- `/Users/guru/Downloads/sta/stra/wordfence-waf.php`

Do not upload:
- deleted rogue files already removed locally
- old backup config files

## 5. Database cleanup

- Import or run queries from `/Users/guru/Desktop/webszilla/saas/work-zilla/wp_hack_cleanup.sql`
- Review user deletion section before uncommenting
- Remove spam comments
- Clear `session_tokens` and `_application_passwords`

## 6. High-priority admin review

Confirm whether these users are legitimate:
- `adminclient`
- `steven stark`
- `Iyyappan Rajendran`

If `steven stark` or `Iyyappan Rajendran` are not expected:
- delete those users
- reassign their posts to the real admin

## 7. Password and secret rotation

Change immediately:
- cPanel password
- WordPress admin passwords
- database password
- FTP/SFTP passwords

Also rotate:
- WordPress salts in `wp-config.php`

## 8. Plugin hardening

Remove any plugin you do not actively use.

Extra caution for historically risky or commonly exploited plugins:
- file manager plugins
- slider plugins
- staging/migration plugins
- header/footer code injection plugins

Specifically inspect settings of:
- `wp-headers-and-footers`
- `collectchat`
- Elementor HTML widgets/custom code

## 9. Final validation after live upload

- Home page opens normally
- No redirect for Googlebot or search visitors
- `view-source` does not contain spam scripts or injected doorway content
- Comments section no longer shows spam
- Wordfence scan passes
- Search Console / browser fetch shows the correct page

## 10. Strong recommendation

Before switching fully live:
- keep a fresh full backup
- test the cleaned site on staging or a temporary subdomain first
