'use client';

import { createTheme, ThemeProvider } from '@mui/material/styles';

/**
 * The Material UI theme, so MUI's components speak the app's palette rather
 * than Material's stock one.
 *
 * WHY NOT MUI'S DEFAULTS. Its primary is a blue (#1976d2) and its warning an
 * orange (#ed6c02), and this app cannot have either. Petrol is dark blue and
 * diesel is orange - deliberately, because the owner's father reads those two
 * colours to know which nozzle he is entering (see fuel-colors.js). A blue
 * button beside a blue Petrol badge on the Readings screen spends the one cue
 * that had to stay unmistakable. So the fuels keep blue and orange, and the
 * chrome takes green, red and slate; two vocabularies that never overlap.
 *
 * It also fixed a split the app already had. Buttons were MUI blue while
 * links, success messages, "Entered" chips and every positive figure were
 * brand green - two primaries, and the blue one belonged to neither the app
 * nor the fuels.
 *
 * PRIMARY IS BRAND-700, NOT BRAND-600. MUI puts white text on a contained
 * button, and white on brand-600 (#059669) is 3.77:1 - under AA, which the
 * old `.btn-primary` had been shipping unnoticed since it used the same fill.
 * brand-700 is 5.48:1 and passes. `dark` is brand-800 for the hover, so the
 * button still darkens on press.
 *
 * Only the palette is set. The sizing, the uppercase labels and the elevation
 * are MUI's own, which is what the owner asked for - this changes the hue, not
 * the look.
 */
const theme = createTheme({
  palette: {
    primary: {
      main: '#047857', // brand-700, 5.48:1 behind white
      dark: '#065f46', // brand-800
      light: '#059669', // brand-600
      contrastText: '#ffffff',
    },
    error: {
      main: '#b91c1c', // red-700, the same red as destructive text elsewhere
      dark: '#991b1b',
      light: '#dc2626',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#b45309', // amber-700, kept well clear of diesel's #FDBA74
      contrastText: '#ffffff',
    },
    success: {
      main: '#047857', // the same green as primary: "done" and "go" are one idea here
      contrastText: '#ffffff',
    },
  },
});

export default function AppTheme({ children }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
