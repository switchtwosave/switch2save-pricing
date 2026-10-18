# QR card behavior and validation

Updated October 18, 2026.

`review.html` now presents four design tiles. The bottom of each tile offers **Generate Smart Review**, **Upload Google QR**, and **Upload Zelle QR**. Selecting a design opens its own business details, address, logo, colors, sizes, copy and QR source in the shared editor. These drafts are held in memory for the open page only. Refreshing or closing the page clears them.

`review.js` handles tile state, image selection and export. `review-core.js` supplies URL and image validation. Existing calculator changes are separate and were not edited during this work.

- Smart Review generates a QR for the existing URL supplied for that tile. It retains the optional downloadable Google-search redirect HTML workflow. This tool does not provision hosting, verify the destination, or gate reviews.
- Google and Zelle accept existing PNG, JPEG or WebP images locally. Original image bytes remain the QR source; they are not re-encoded into a new payload. Validation checks file signature, declared type, decode, dimensions and an 8 MB limit. Uploaded images have no network upload path.
- Zelle has payment copy, a payment caption and no review stars. Switching modes restores separate review/payment copy while retaining the tile’s identity and design. No payment or account operation is performed.
- Existing uploaded sources can be selected again from the same three buttons. **Replace uploaded QR** selects a new image for the active tile. Design 4 remains an information-only card by default and supports an optional QR.
- PNG and JPG exports capture the selected design before asynchronous rendering begins. They are 1600 × 960 pixels with the existing 800 × 480 layout at 2×. PNG is preferred for sharp QR edges. Uploaded QR images use `object-fit: contain` and a white margin.
- If the browser provides BarcodeDetector with QR support, uploads must contain exactly one readable QR and exported payloads are compared to the original. Otherwise the UI explicitly requires a manual scan of the source and final image. Recognition does not verify a merchant, review page or payment recipient.
- A separate, explicitly labeled reset clears only the current design’s business name, address and QR sources after a confirmation. Other tiles and styling remain intact.

Dependencies remain the existing pinned CDN versions of qrcode-generator 1.4.4 and html-to-image 1.11.11, plus Google Fonts. If a library is unavailable, the page reports that the requested generation/export did not complete. Local file input data is not sent to those services.

Validation covered all 12 controls, independent drafts, original image-source retention, URL/image rejection, corrupted images, mode/copy switching, asynchronous upload targeting and cancellation, reset isolation, optional QR on design 4, export snapshots, decoder match/mismatch gates and missing generator behavior. An actual 1600 × 960 PNG exported in the browser was visually inspected and its known test payload decoded independently. The local test harness and fixtures are kept outside the published site.
