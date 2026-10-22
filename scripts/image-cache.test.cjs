const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  path = require("node:path");
function harness() {
  let failed = false,
    key;
  const exports = {};
  const react = { useState: () => [failed, (value) => (failed = value)] };
  const jsx = (type, props, key) => ({ type, props, key });
  const imports = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "expo-image": { Image: "ExpoImage" },
    "../../assets/icons/icon.png": 123,
  };
  const code = ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, "../src/components/CachedImage.tsx"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  new vm.Script(code).runInNewContext({
    exports,
    require: (name) => {
      assert.ok(Object.hasOwn(imports, name), name);
      return imports[name];
    },
  });
  return (props) => {
    const view = exports.CachedImage(props);
    if (view.key !== key) {
      failed = false;
      key = view.key;
    }
    return view.type(view.props);
  };
}
test("all remote artwork uses URI-stable disk/memory caching without extra transitions or resize requests", () => {
  const render = harness();
  const style = { width: 44, height: 44 };
  const a = render({
    source: { uri: "https://images.test/hash.jpg", width: 800, height: 600 },
    resizeMode: "contain",
    style,
    accessibilityLabel: "Show artwork",
  });
  assert.equal(a.props.cachePolicy, "memory-disk");
  assert.equal(a.props.transition, 0);
  assert.equal(a.props.contentFit, "contain");
  assert.equal(a.props.style, style);
  assert.equal(a.props.accessibilityLabel, "Show artwork");
  const b = render({
    source: { uri: "https://images.test/hash.jpg", width: 400, height: 300 },
    resizeMode: "cover",
  });
  assert.equal(a.props.recyclingKey, b.props.recyclingKey);
  assert.equal(b.props.contentFit, "cover");
});
test("an R2 error displays a bundled placeholder once and never requests a Supabase fallback", () => {
  const render = harness();
  let errors = 0;
  const props = {
    source: { uri: "https://images.test/missing.jpg" },
    onError: () => errors++,
  };
  render(props).props.onError({ error: "Not found" });
  const failed = render(props);
  assert.equal(failed.props.source, 123);
  assert.equal(failed.props.contentFit, "contain");
  assert.equal(errors, 1);
  failed.props.onError({ error: "Repeated" });
  assert.equal(errors, 1);
  const next = render({
    ...props,
    source: { uri: "https://images.test/another.jpg" },
  });
  assert.equal(next.props.source.uri, "https://images.test/another.jpg");
});
test("cached image events preserve native dimension callbacks for event artwork and player transitions", () => {
  const render = harness();
  let loaded,
    ended = 0;
  const image = render({
    source: 5,
    resizeMode: "stretch",
    onLoad: (e) => (loaded = e.nativeEvent.source),
    onLoadEnd: () => ended++,
  });
  image.props.onLoad({
    source: { url: "https://images.test/a.jpg", width: 1200, height: 800 },
  });
  image.props.onLoadEnd();
  assert.equal(loaded.width, 1200);
  assert.equal(loaded.height, 800);
  assert.equal(loaded.uri, "https://images.test/a.jpg");
  assert.equal(ended, 1);
  assert.equal(image.props.contentFit, "fill");
});
