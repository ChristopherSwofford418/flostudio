# FloStudio Video Generation API Notes

Source reviewed: OpenAI Developer Documentation, “Video generation with Sora,” accessed 2026-08-17.

- Video creation is asynchronous. A creation request returns a job identifier and a status such as `queued` or `in_progress`; clients should poll the job status until it becomes `completed`.
- The finished MP4 is retrieved from the completed job’s content endpoint. FloStudio must never substitute a stock video URL for a generated user result.
- A product image can guide the creation as an image reference and acts as the first frame of the video. The flow must preserve user-uploaded product images where the provider permits them.
- API restrictions can reject prompts involving real people, copyrighted characters or music, and input images containing human faces. The UI must show these limits before a user starts a render.
- The current Sora 2 API documentation says the Sora 2 video models and Videos API are scheduled to shut down on September 24, 2026. FloStudio should isolate provider calls behind its own server API and clearly return provider capability errors rather than inventing video outputs.
