rules_version = '2';
// Greenmech security rules. Source of truth for every permission (BUILD_PROMPT.md section 6).
// Max get()/exists()/getAfter() per request: 10 single-doc, 20 batch/transaction. Every path here stays <= 5.
service cloud.firestore {
  match /databases/{db}/documents {
    // ---------- identity ----------
    function signedIn() {
      return request.auth != null && request.auth.token.email_verified == true
        && request.auth.token.firebase.sign_in_provider == 'google.com';
    }
    function uid() { return request.auth.uid; }
    function me() { return request.auth.token.email.lower(); }
    function isAdmin() { return signedIn() && me() in __ADMIN_EMAILS__; }
    function entryPath() { return /databases/$(db)/documents/allowlist/$(me()); }
    function listed() { return signedIn() && exists(entryPath()); }
    function entry() { return get(entryPath()).data; }
    function role() { return listed() ? entry().role : 'none'; }
    function isMember() { return isAdmin() || role() == 'member'; }
    function isCoach() { return !isAdmin() && role() == 'coach'; }
    function canRead() { return isAdmin() || role() in ['member', 'coach']; }
    // Initials written by a caller must equal their allowlist initials. An admin without an entry signs as 'ADM'.
    function myInitials() { return listed() ? entry().initials : (isAdmin() ? 'ADM' : null); }

    // ---------- data helpers ----------
    function d() { return request.resource.data; }
    function onlyKeys(keys) { return d().diff(resource.data).affectedKeys().hasOnly(keys); }
    function exactKeys(keys) { return d().keys().hasOnly(keys) && d().keys().hasAll(keys); }
    function str(v, min, max) { return v is string && v.size() >= min && v.size() <= max; }
    function mod(id) { return get(/databases/$(db)/documents/modules/$(id)).data; }
    function leads(id) { return mod(id).leaderUid == uid(); }
    function moduleLive(id) {
      return exists(/databases/$(db)/documents/modules/$(id)) && mod(id).deletedAt == null;
    }
    function slugShape(s) { return s is string && s.size() >= 2 && s.size() <= 32 && s.matches('^[a-z0-9]+(-[a-z0-9]+)*$'); }
    function slugOwned(s, id, kind) {
      return slugShape(s) && getAfter(/databases/$(db)/documents/slugs/$(s)).data.refId == id
        && getAfter(/databases/$(db)/documents/slugs/$(s)).data.kind == kind;
    }
    function audit() { return d().updatedAt == request.time && d().updatedBy == uid(); }
    function port(p) { return p in ['none', 'ball', 'spin', 'push', 'water', 'other']; }
    function validPorts(p) {
      return p is map && p.keys().hasOnly(['in', 'out']) && p.keys().hasAll(['in', 'out']) && port(p['in']) && port(p.out);
    }

    // ---------- modules ----------
    function moduleShape() {
      return exactKeys(['slug', 'status', 'tier', 'order', 'purpose', 'hasModel', 'ports', 'leaderUid', 'leaderInitials',
                        'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deletedAt'])
        && d().status in [0, 1, 2, 3] && d().tier is int && d().tier >= -1 && d().tier <= 50
        && d().order is int && str(d().purpose, 0, 200) && d().hasModel is bool && validPorts(d().ports)
        && (d().leaderUid == null || d().leaderUid is string)
        && (d().leaderInitials == null || str(d().leaderInitials, 1, 3))
        && (d().deletedAt == null || d().deletedAt is timestamp)
        && audit();
    }
    function slugUnchangedOrOwned(id) { return d().slug == resource.data.slug || slugOwned(d().slug, id, 'module'); }

    match /modules/{id} {
      allow read: if canRead() && (isAdmin() || resource.data.deletedAt == null);
      allow create: if isMember() && moduleShape() && slugOwned(d().slug, id, 'module')
        && d().status == 0 && d().tier == -1 && d().order == 0 && d().leaderUid == null && d().leaderInitials == null
        && d().deletedAt == null && d().createdBy == uid() && d().createdAt == request.time;
      allow update: if moduleShape() && d().createdBy == resource.data.createdBy && d().createdAt == resource.data.createdAt
        && slugUnchangedOrOwned(id)
        && (isAdmin() || (isMember() && resource.data.deletedAt == null && memberModuleUpdate()));
      allow delete: if isAdmin();

      function memberModuleUpdate() {
        return (
          // claim an unled module
          (resource.data.leaderUid == null && d().leaderUid == uid() && d().leaderInitials == myInitials()
            && onlyKeys(['leaderUid', 'leaderInitials', 'updatedAt', 'updatedBy']))
          // step down from your own
          || (resource.data.leaderUid == uid() && d().leaderUid == null && d().leaderInitials == null
            && onlyKeys(['leaderUid', 'leaderInitials', 'updatedAt', 'updatedBy']))
          // leader edits
          || (resource.data.leaderUid == uid()
            && onlyKeys(['status', 'purpose', 'ports', 'hasModel', 'slug', 'updatedAt', 'updatedBy']))
        );
      }

      match /body/{doc} {
        allow read: if canRead() && doc == 'main' && (isAdmin() || mod(id).deletedAt == null);
        allow create, update: if doc == 'main' && (isAdmin() || (isMember() && leads(id) && mod(id).deletedAt == null))
          && d().keys().hasOnly(['plan', 'model'])
          && str(d().plan, 0, 20000)
          && (d().model == null || (d().model is map && d().model.keys().hasOnly(['svg', 'updatedAt', 'updatedBy'])
              && str(d().model.svg, 1, 40000) && d().model.updatedBy == uid() && d().model.updatedAt is timestamp));
        allow delete: if isAdmin();
      }
    }

    // ---------- connections ----------
    function connShape() {
      return exactKeys(['slug', 'aId', 'bId', 'state', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deletedAt'])
        && d().state in [1, 2, 3] && d().aId is string && d().bId is string
        && (d().deletedAt == null || d().deletedAt is timestamp) && audit();
    }
    function bothDone() { return mod(d().aId).status == 3 && mod(d().bId).status == 3; }

    match /connections/{id} {
      allow read: if canRead() && (isAdmin() || resource.data.deletedAt == null);
      allow create: if isMember() && connShape() && id == d().aId + '__' + d().bId && d().aId != d().bId
        && moduleLive(d().aId) && moduleLive(d().bId) && d().state == 1 && d().deletedAt == null
        && d().createdBy == uid() && d().createdAt == request.time && slugOwned(d().slug, id, 'connection');
      allow update: if connShape() && d().aId == resource.data.aId && d().bId == resource.data.bId
        && d().createdBy == resource.data.createdBy && d().createdAt == resource.data.createdAt
        && (d().slug == resource.data.slug || slugOwned(d().slug, id, 'connection'))
        && (d().state == resource.data.state || d().state == 1 || bothDone())
        && (isAdmin() || (isMember() && resource.data.deletedAt == null
            && (leads(resource.data.aId) || leads(resource.data.bId))
            && onlyKeys(['state', 'slug', 'updatedAt', 'updatedBy'])));
      allow delete: if isAdmin();
    }

    // ---------- slug registry (immutable) ----------
    match /slugs/{s} {
      allow read: if canRead();
      allow create: if isMember() && exactKeys(['kind', 'refId']) && d().kind in ['module', 'connection']
        && slugShape(s) && !(s in ['new', 'manage', 'monitor', 'help', 'signin', 'access', 'api', 'connections'])
        && getAfter(/databases/$(db)/documents/$(d().kind == 'module' ? 'modules' : 'connections')/$(d().refId)).data.slug == s;
      allow update: if false;
      allow delete: if isAdmin();
    }

    // ---------- discussion and references ----------
    function authored() {
      return d().authorUid == uid() && d().authorInitials == myInitials()
        && d().createdAt == request.time;
    }
    match /ideas/{id} {
      allow read: if canRead();
      allow create: if isMember() && exactKeys(['moduleId', 'text', 'authorUid', 'authorInitials', 'createdAt'])
        && str(d().text, 1, 1000) && authored() && moduleLive(d().moduleId);
      allow update: if false;
      allow delete: if isAdmin() || (isMember() && resource.data.authorUid == uid());
    }
    match /flags/{id} {
      allow read: if canRead();
      allow create: if isMember()
        && exactKeys(['moduleId', 'text', 'authorUid', 'authorInitials', 'resolved', 'resolvedBy', 'createdAt', 'resolvedAt'])
        && str(d().text, 1, 500) && authored() && moduleLive(d().moduleId)
        && d().resolved == false && d().resolvedBy == null && d().resolvedAt == null;
      allow update: if isMember() && onlyKeys(['resolved', 'resolvedBy', 'resolvedAt'])
        && (resource.data.authorUid == uid() || isAdmin() || leads(resource.data.moduleId))
        && ((d().resolved == true && d().resolvedBy == uid() && d().resolvedAt == request.time)
          || (d().resolved == false && d().resolvedBy == null && d().resolvedAt == null));
      allow delete: if isAdmin() || (isMember() && resource.data.authorUid == uid());
    }
    match /refs/{id} {
      allow read: if canRead();
      allow create: if isMember() && exactKeys(['moduleId', 'kind', 'title', 'url', 'data', 'authorUid', 'createdAt'])
        && d().authorUid == uid() && d().createdAt == request.time
        && str(d().title, 1, 120) && moduleLive(d().moduleId)
        && ((d().kind == 'link' && str(d().url, 9, 2048) && d().url.matches('^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^\\s]*)?$') && d().data == null)
          || (d().kind == 'vector' && str(d().data, 1, 250000) && d().url == null));
      allow update: if false;
      allow delete: if isAdmin() || (isMember() && resource.data.authorUid == uid());
    }

    // ---------- activity (client-written, coordination only) ----------
    match /activity/{id} {
      allow read: if canRead();
      allow create: if isMember()
        && exactKeys(['at', 'actorUid', 'actorInitials', 'type', 'targetKind', 'targetId', 'targetSlug', 'summary'])
        && d().at == request.time && d().actorUid == uid() && d().actorInitials == myInitials()
        && str(d().type, 1, 40) && d().targetKind in ['module', 'connection', 'team', 'data']
        && str(d().targetId, 1, 200) && (d().targetSlug == null || str(d().targetSlug, 1, 32))
        && str(d().summary, 1, 200);
      allow update: if false;
      allow delete: if isAdmin();
    }

    // ---------- team ----------
    match /allowlist/{email} {
      allow read: if isAdmin() || (signedIn() && email == me());
      allow create, update: if isAdmin() && email == email.lower()
        && exactKeys(['role', 'initials', 'addedBy', 'addedAt'])
        && d().role in ['member', 'coach'] && d().initials is string && d().initials.matches('^[A-Z0-9]{1,3}$')
        && d().addedBy == uid() && d().addedAt == request.time;
      allow delete: if isAdmin();
    }
    match /accessRequests/{u} {
      allow read: if isAdmin() || (signedIn() && u == uid());
      allow create: if signedIn() && u == uid() && !listed() && !isAdmin()
        && exactKeys(['email', 'displayName', 'requestedAt'])
        && d().email == request.auth.token.email && str(d().displayName, 1, 60) && d().requestedAt == request.time;
      allow update: if false;
      allow delete: if isAdmin();
    }
    match /users/{u} {
      allow read: if isAdmin() || (canRead() && u == uid());
      allow create, update: if canRead() && u == uid() && d().keys().hasOnly(['theme', 'shortcuts'])
        && (!('theme' in d()) || d().theme in ['system', 'light', 'dark'])
        && (!('shortcuts' in d()) || d().shortcuts is bool);
      allow delete: if isAdmin() || (canRead() && u == uid());
    }
    match /config/{doc} {
      allow read: if canRead();
      allow write: if isAdmin() && doc == 'app' && exactKeys(['staleDays', 'lastBackupAt'])
        && d().staleDays is int && d().staleDays >= 1 && d().staleDays <= 90
        && (d().lastBackupAt == null || d().lastBackupAt is timestamp);
    }
  }
}
