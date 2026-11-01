package io.github.mooncakecmd.bab;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * O aplicativo: o site (assets/index.html) numa WebView em https://appassets.androidplatform.net/, mais a ponte
 * window.BabApp para a pasta dos mundos do Minecraft, escolhida pelo seletor de pastas do Android (SAF). Os arquivos do
 * mundo são lidos direto da pasta pelas respostas /w/<id>/list e /w/<id>/f/<caminho> (ver src/appmode.js).
 * No Android 11 e 12, o seletor deixa escolher Android/data/... quando já abre nela (EXTRA_INITIAL_URI).
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String EXT = "com.android.externalstorage.documents";
    static final String MC = "primary:Android/data/com.mojang.minecraftpe/files/games/com.mojang/minecraftWorlds";
    static final int PICK_TREE = 1, PICK_FILE = 2;

    WebView web;
    SharedPreferences prefs;
    ValueCallback<Uri[]> fileCb;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("bab", MODE_PRIVATE);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.addJavascriptInterface(new Bridge(), "BabApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                try { return serve(u); } catch (Exception e) { return text(500, "text/plain", String.valueOf(e.getMessage())); }
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* sem navegador */ }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try { startActivityForResult(i, PICK_FILE); } catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });
        if (b != null) web.restoreState(b); else web.loadUrl("https://" + HOST + "/index.html");
    }

    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.appOnBack ? appOnBack() : false", v -> { if (!"true".equals(v)) finish(); });
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == PICK_FILE) {
            if (fileCb != null) fileCb.onReceiveValue(res == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null);
            fileCb = null;
            return;
        }
        if (req != PICK_TREE) return;
        if (res != RESULT_OK || data == null || data.getData() == null) { js("appFolderPicked(false,'')"); return; }
        Uri tree = data.getData();
        try {
            getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception e) { /* sem permissão guardada: vale até fechar */ }
        prefs.edit().putString("tree", tree.toString()).apply();
        String w = worldsDir();
        js(w == null ? "appFolderPicked(false," + JSONObject.quote("Não achei mundos nessa pasta. Escolha a pasta minecraftWorlds (em Android/data/com.mojang.minecraftpe/files/games/com.mojang).") + ")" : "appFolderPicked(true,'')");
    }

    void js(String code) { runOnUiThread(() -> web.evaluateJavascript(code, null)); }

    // ---------- A pasta escolhida ----------
    Uri tree() { String t = prefs.getString("tree", null); return t == null ? null : Uri.parse(t); }
    Uri doc(String id) { return DocumentsContract.buildDocumentUriUsingTree(tree(), id); }

    /** Filhos de uma pasta: nome -> [documentId, mime, tamanho, data] */
    Map<String, String[]> children(String parentId) {
        Map<String, String[]> out = new HashMap<>();
        Uri q = DocumentsContract.buildChildDocumentsUriUsingTree(tree(), parentId);
        try (Cursor c = getContentResolver().query(q, new String[]{
                DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED}, null, null, null)) {
            while (c != null && c.moveToNext())
                out.put(c.getString(1), new String[]{c.getString(0), c.getString(2), String.valueOf(c.getLong(3)), String.valueOf(c.getLong(4))});
        } catch (Exception e) { /* pasta que não existe ou sem permissão */ }
        return out;
    }
    static boolean isDir(String[] e) { return DocumentsContract.Document.MIME_TYPE_DIR.equals(e[1]); }

    /** A pasta com os mundos: a escolhida, ou minecraftWorlds dentro dela (escolher com.mojang, games ou Android/data também vale) */
    String worldsDir() {
        Uri t = tree(); if (t == null) return null;
        String root = DocumentsContract.getTreeDocumentId(t);
        String[] tries = {root, root + "/minecraftWorlds", root + "/com.mojang/minecraftWorlds", root + "/games/com.mojang/minecraftWorlds",
                root + "/files/games/com.mojang/minecraftWorlds", root + "/com.mojang.minecraftpe/files/games/com.mojang/minecraftWorlds"};
        for (String id : tries) {
            Map<String, String[]> ch = children(id);
            if (ch.containsKey("level.dat")) return "@" + id; // a pasta escolhida já é um mundo
            for (String[] e : ch.values()) if (isDir(e) && children(e[0]).containsKey("level.dat")) return id;
        }
        return null;
    }

    /** documentId de um arquivo do mundo pelo caminho (db/000005.log). Na memória do aparelho, o id é o próprio caminho. */
    String fileId(String world, String rel) {
        if (tree().getAuthority() != null && tree().getAuthority().endsWith(EXT)) return world + "/" + rel;
        String cur = world;
        for (String part : rel.split("/")) { String[] e = children(cur).get(part); if (e == null) return null; cur = e[0]; }
        return cur;
    }

    // ---------- Respostas para a página ----------
    WebResourceResponse text(int code, String mime, String body) {
        WebResourceResponse r = new WebResourceResponse(mime, "utf-8", new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
        r.setStatusCodeAndReasonPhrase(code, code == 200 ? "OK" : "Erro");
        return r;
    }
    WebResourceResponse serve(Uri u) throws Exception {
        String p = u.getPath();
        if (p == null || p.equals("/") || p.equals("/index.html")) return new WebResourceResponse("text/html", "utf-8", getAssets().open("index.html"));
        List<String> seg = u.getPathSegments(); // já decodificados
        if (seg.size() >= 3 && seg.get(0).equals("w")) {
            String world = seg.get(1);
            if (seg.get(2).equals("list")) {
                JSONArray a = new JSONArray();
                list(world, "", a);
                return text(200, "application/json", a.toString());
            }
            if (seg.get(2).equals("f")) {
                String rel = String.join("/", seg.subList(3, seg.size()));
                String id = fileId(world, rel);
                if (id == null) return text(404, "text/plain", "não existe");
                try {
                    InputStream in = getContentResolver().openInputStream(doc(id));
                    return new WebResourceResponse("application/octet-stream", null, in);
                } catch (FileNotFoundException e) { return text(404, "text/plain", "não existe"); }
            }
        }
        return text(404, "text/plain", "não existe");
    }
    void list(String dirId, String pre, JSONArray out) throws Exception {
        for (Map.Entry<String, String[]> e : children(dirId).entrySet()) {
            String[] v = e.getValue();
            if (isDir(v)) { if (pre.isEmpty() && e.getKey().equals("db")) list(v[0], "db/", out); continue; } // só a raiz do mundo e a pasta db
            JSONObject o = new JSONObject(); o.put("p", pre + e.getKey()); o.put("s", Long.parseLong(v[2])); out.put(o);
        }
    }

    static void copy(InputStream in, OutputStream out) throws Exception {
        try (InputStream i = in; OutputStream o = out) { byte[] buf = new byte[65536]; int n; while ((n = i.read(buf)) > 0) o.write(buf, 0, n); }
    }
    File backupFile(String world, String rel, String t) {
        return new File(getFilesDir(), "copias/" + Integer.toHexString(world.hashCode()) + "/" + t + "/" + rel);
    }
    /** Abre o arquivo do mundo para gravar do começo (cria se não existir; a pasta db já existe) */
    OutputStream openWrite(String world, String rel) throws Exception {
        ContentResolver cr = getContentResolver();
        String id = fileId(world, rel);
        if (id != null) { try { return cr.openOutputStream(doc(id), "wt"); } catch (FileNotFoundException e) { /* não existe: cria */ } }
        int k = rel.lastIndexOf('/');
        String parent = k < 0 ? world : fileId(world, rel.substring(0, k)), name = rel.substring(k + 1);
        if (parent == null) throw new FileNotFoundException(rel);
        Uri made = DocumentsContract.createDocument(cr, doc(parent), "application/octet-stream", name);
        if (made == null) throw new FileNotFoundException(rel);
        String got = DocumentsContract.getDocumentId(made);
        if (!got.endsWith("/" + name)) { DocumentsContract.deleteDocument(cr, made); throw new Exception("o Android mudou o nome do arquivo (" + got + ")"); }
        return cr.openOutputStream(made, "wt");
    }

    // ---------- window.BabApp ----------
    class Bridge {
        @JavascriptInterface public String folder() { Uri t = tree(); return t == null ? "" : t.toString(); }
        /** Abre o seletor de pastas do Android já na pasta pedida (rel, a partir da memória do aparelho). Como o File
         *  Manager+ faz: o endereço inicial no formato de árvore (tree/.../document/...), que no Android 11 e 12 deixa
         *  escolher pastas dentro de Android/data. */
        @JavascriptInterface public void pickFolder(String rel) {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
            String id = "primary:" + (rel == null || rel.isEmpty() ? MC.substring(8) : rel);
            Uri t = DocumentsContract.buildTreeDocumentUri(EXT, id);
            i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, DocumentsContract.buildDocumentUriUsingTree(t, id));
            i.putExtra("android.content.extra.SHOW_ADVANCED", true);
            i.putExtra("android.provider.extra.SHOW_ADVANCED", true);
            runOnUiThread(() -> startActivityForResult(i, PICK_TREE));
        }
        @JavascriptInterface public String worlds() {
            JSONArray a = new JSONArray();
            try {
                String dir = worldsDir();
                if (dir == null) return "[]";
                List<String[]> ws = new ArrayList<>();
                if (dir.startsWith("@")) ws.add(new String[]{dir.substring(1), dir.substring(dir.lastIndexOf('/') + 1)});
                else for (Map.Entry<String, String[]> e : children(dir).entrySet()) if (isDir(e.getValue())) ws.add(new String[]{e.getValue()[0], e.getKey()});
                for (String[] w : ws) {
                    Map<String, String[]> ch = children(w[0]);
                    String[] ld = ch.get("level.dat"); if (ld == null) continue;
                    String name = w[1];
                    String[] ln = ch.get("levelname.txt");
                    if (ln != null) try (InputStream in = getContentResolver().openInputStream(doc(ln[0]))) {
                        byte[] buf = new byte[512]; int n = in.read(buf); if (n > 0) name = new String(buf, 0, n, StandardCharsets.UTF_8).trim();
                    } catch (Exception e) { /* fica o nome da pasta */ }
                    JSONObject o = new JSONObject();
                    o.put("id", w[0]); o.put("name", name); o.put("time", Long.parseLong(ld[3])); o.put("icon", ch.containsKey("world_icon.jpeg"));
                    a.put(o);
                }
            } catch (Exception e) { return "[]"; }
            return a.toString();
        }
        @JavascriptInterface public String write(String world, String rel, String b64) {
            try { byte[] d = Base64.decode(b64, Base64.DEFAULT); try (OutputStream o = openWrite(world, rel)) { o.write(d); } return "ok"; }
            catch (Exception e) { return String.valueOf(e.getMessage()); }
        }
        @JavascriptInterface public String backup(String world, String rel, String t) {
            try { File f = backupFile(world, rel, t); f.getParentFile().mkdirs(); copy(getContentResolver().openInputStream(doc(fileId(world, rel))), new FileOutputStream(f)); return "ok"; }
            catch (Exception e) { return String.valueOf(e.getMessage()); }
        }
        @JavascriptInterface public String restore(String world, String rel, String t) {
            try { copy(new FileInputStream(backupFile(world, rel, t)), openWrite(world, rel)); return "ok"; }
            catch (Exception e) { return String.valueOf(e.getMessage()); }
        }
        @JavascriptInterface public String remove(String world, String rel) {
            try { String id = fileId(world, rel); if (id != null) DocumentsContract.deleteDocument(getContentResolver(), doc(id)); return "ok"; }
            catch (Exception e) { return String.valueOf(e.getMessage()); }
        }
    }
}
