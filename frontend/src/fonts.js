// The app's fonts, served from its own origin so no phone makes a request to
// another site to draw a page. Vite bundles these files with a hash in their
// names, so they are cached for a year like the rest of /assets. Only the
// Latin subset is bundled (the text is English); a character outside it falls
// back to the system font. The families and weights are the ones design.md
// lists under "Typography", and fonts.test.js checks that every font token in
// index.css has them.
import '@fontsource/unbounded/latin-400.css'
import '@fontsource/unbounded/latin-700.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-700.css'
// A variable font, so DM Sans keeps its optical-size axis.
import '@fontsource-variable/dm-sans/opsz.css'
