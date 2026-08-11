//! Instagram/Facebook Graph API client, ported from `lib/meta/client.ts`.
//!
//! A `MetaClient` holds the HTTP client and per-app config (graph API
//! version, app secret) instead of the Node module's implicit
//! `process.env` reads, so it stays constructible/testable without a
//! global environment.

use serde::{Deserialize, Serialize};

use super::error::{handle_response, MetaApiError};

#[derive(Clone)]
pub struct MetaClient {
    http: reqwest::Client,
    graph_api_version: String,
    instagram_app_secret: String,
}

// Instagram caps a single media page at 100 items.
const MEDIA_PAGE_SIZE: usize = 100;
const MEDIA_FIELDS: &str = "id,caption,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count";
// Instagram only retains ~30 days of account insights, and rejects windows
// wider than 30 days outright. Stay just inside the limit.
const FOLLOWER_INSIGHT_MAX_DAYS: i64 = 30;

impl MetaClient {
    pub fn new(graph_api_version: impl Into<String>, instagram_app_secret: impl Into<String>) -> Self {
        Self {
            http: reqwest::Client::new(),
            graph_api_version: graph_api_version.into(),
            instagram_app_secret: instagram_app_secret.into(),
        }
    }

    pub fn from_config(config: &crate::config::Config) -> Self {
        Self::new(
            config.meta_graph_api_version.clone(),
            config.instagram_app_secret.clone(),
        )
    }

    fn instagram_graph_base(&self) -> String {
        format!("https://graph.instagram.com/{}", self.graph_api_version)
    }

    fn facebook_graph_base(&self) -> String {
        format!("https://graph.facebook.com/{}", self.graph_api_version)
    }

    pub async fn send_private_reply(
        &self,
        access_token: &str,
        instagram_account_id: &str,
        comment_id: &str,
        message: &str,
    ) -> Result<SendMessageResult, MetaApiError> {
        let url = format!(
            "{}/{}/messages",
            self.instagram_graph_base(),
            instagram_account_id
        );
        let body = serde_json::json!({
            "recipient": { "comment_id": comment_id },
            "message": { "text": message },
        });
        let response = self
            .http
            .post(url)
            .bearer_auth(access_token)
            .json(&body)
            .send()
            .await?;
        handle_response(response).await
    }

    /// Send a private reply to a comment as a button template — an opening
    /// message plus a postback button. Tapping the button opens the
    /// conversation and fires a `messaging_postbacks` webhook carrying
    /// `payload`, used to deliver the follow-up ("reveal") message.
    pub async fn send_private_reply_with_button(
        &self,
        access_token: &str,
        instagram_account_id: &str,
        comment_id: &str,
        text: &str,
        button_title: &str,
        payload: &str,
    ) -> Result<SendMessageResult, MetaApiError> {
        let url = format!(
            "{}/{}/messages",
            self.instagram_graph_base(),
            instagram_account_id
        );
        let body = serde_json::json!({
            "recipient": { "comment_id": comment_id },
            "message": {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "button",
                        // Button template text is capped at 640 chars by Meta.
                        "text": truncate_chars(text, 640),
                        "buttons": [
                            { "type": "postback", "title": truncate_chars(button_title, 20), "payload": payload }
                        ],
                    }
                }
            }
        });
        let response = self
            .http
            .post(url)
            .bearer_auth(access_token)
            .json(&body)
            .send()
            .await?;
        handle_response(response).await
    }

    /// Send a direct message (to a user's IGSID) as a button template with a
    /// single postback button. Used to re-prompt a user during follow-gating,
    /// so tapping the button fires another `messaging_postbacks` webhook
    /// carrying `payload`.
    pub async fn send_direct_message_with_button(
        &self,
        access_token: &str,
        instagram_account_id: &str,
        user_id: &str,
        text: &str,
        button_title: &str,
        payload: &str,
    ) -> Result<SendMessageResult, MetaApiError> {
        let url = format!(
            "{}/{}/messages",
            self.instagram_graph_base(),
            instagram_account_id
        );
        let body = serde_json::json!({
            "recipient": { "id": user_id },
            "message": {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "button",
                        "text": truncate_chars(text, 640),
                        "buttons": [
                            { "type": "postback", "title": truncate_chars(button_title, 20), "payload": payload }
                        ],
                    }
                }
            }
        });
        let response = self
            .http
            .post(url)
            .bearer_auth(access_token)
            .json(&body)
            .send()
            .await?;
        handle_response(response).await
    }

    /// Check whether a user (by their IGSID) follows the business account,
    /// via the Instagram Messaging profile API. Returns `None` on any
    /// transport/HTTP error or when Meta omits the field, mirroring the
    /// Node client's try/catch-to-null behavior — callers decide how to
    /// treat the unverifiable case.
    pub async fn get_user_follow_status(&self, access_token: &str, recipient_id: &str) -> Option<bool> {
        let mut url = url::Url::parse(&format!("{}/{}", self.instagram_graph_base(), recipient_id)).ok()?;
        url.query_pairs_mut().append_pair("fields", "is_user_follow_business");

        let response = self.http.get(url).bearer_auth(access_token).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        let data: serde_json::Value = response.json().await.ok()?;
        data.get("is_user_follow_business").and_then(|v| v.as_bool())
    }

    /// Send a private reply to a comment as a button template with up to 3
    /// web_url buttons — the reveal message plus tappable link buttons (for
    /// campaigns with no opening DM, where the reveal is delivered straight
    /// to the comment).
    pub async fn send_private_reply_with_link_button(
        &self,
        access_token: &str,
        instagram_account_id: &str,
        comment_id: &str,
        text: &str,
        buttons: &[LinkButton],
    ) -> Result<SendMessageResult, MetaApiError> {
        let url = format!(
            "{}/{}/messages",
            self.instagram_graph_base(),
            instagram_account_id
        );
        let body = serde_json::json!({
            "recipient": { "comment_id": comment_id },
            "message": {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "button",
                        "text": truncate_chars(text, 640),
                        "buttons": to_web_url_buttons(buttons),
                    }
                }
            }
        });
        let response = self
            .http
            .post(url)
            .bearer_auth(access_token)
            .json(&body)
            .send()
            .await?;
        handle_response(response).await
    }

    /// Send a plain-text direct message to a user by their Instagram-scoped
    /// ID. Used to deliver the reveal message after a button postback.
    pub async fn send_direct_message(
        &self,
        access_token: &str,
        instagram_account_id: &str,
        user_id: &str,
        message: &str,
    ) -> Result<SendMessageResult, MetaApiError> {
        let url = format!(
            "{}/{}/messages",
            self.instagram_graph_base(),
            instagram_account_id
        );
        let body = serde_json::json!({
            "recipient": { "id": user_id },
            "message": { "text": message },
        });
        let response = self
            .http
            .post(url)
            .bearer_auth(access_token)
            .json(&body)
            .send()
            .await?;
        handle_response(response).await
    }

    /// Send a direct message as a button template with up to 3 web_url
    /// buttons — the reveal message plus tappable link buttons.
    pub async fn send_direct_message_with_link_button(
        &self,
        access_token: &str,
        instagram_account_id: &str,
        user_id: &str,
        text: &str,
        buttons: &[LinkButton],
    ) -> Result<SendMessageResult, MetaApiError> {
        let url = format!(
            "{}/{}/messages",
            self.instagram_graph_base(),
            instagram_account_id
        );
        let body = serde_json::json!({
            "recipient": { "id": user_id },
            "message": {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "button",
                        "text": truncate_chars(text, 640),
                        "buttons": to_web_url_buttons(buttons),
                    }
                }
            }
        });
        let response = self
            .http
            .post(url)
            .bearer_auth(access_token)
            .json(&body)
            .send()
            .await?;
        handle_response(response).await
    }

    pub async fn send_comment_reply(
        &self,
        access_token: &str,
        comment_id: &str,
        message: &str,
    ) -> Result<CommentReplyResult, MetaApiError> {
        let url = format!("{}/{}/replies", self.instagram_graph_base(), comment_id);
        let body = serde_json::json!({ "message": message });
        let response = self
            .http
            .post(url)
            .bearer_auth(access_token)
            .json(&body)
            .send()
            .await?;
        handle_response(response).await
    }

    pub async fn get_media_comments(
        &self,
        access_token: &str,
        media_id: &str,
    ) -> Result<Vec<InstagramComment>, MetaApiError> {
        let mut url = url::Url::parse(&format!("{}/{}/comments", self.instagram_graph_base(), media_id))
            .expect("valid url");
        url.query_pairs_mut()
            .append_pair("fields", "id,text,from,timestamp")
            .append_pair("access_token", access_token);

        let response = self.http.get(url).send().await?;
        let page: DataPage<InstagramComment> = handle_response(response).await?;
        Ok(page.data)
    }

    /// Recent comments on a media, newest first, each with its replies so the
    /// caller can tell whether the account owner has already responded.
    /// Pagination stops as soon as it reaches comments older than `since_ms`
    /// (or the `max` ceiling), so a viral post's entire back-catalogue is
    /// never pulled — only what is recent enough to still act on. This is
    /// what the polling reconciler reads.
    ///
    /// Note: comments hidden by Instagram's Hidden Words / spam filter may
    /// not be returned by the Graph API at all. Disable that filter on the
    /// account to widen results.
    pub async fn get_recent_media_comments(
        &self,
        access_token: &str,
        media_id: &str,
        since_ms: i64,
        max: usize,
    ) -> Result<Vec<InstagramComment>, MetaApiError> {
        let mut results: Vec<InstagramComment> = Vec::new();

        let mut first = url::Url::parse(&format!("{}/{}/comments", self.instagram_graph_base(), media_id))
            .expect("valid url");
        first
            .query_pairs_mut()
            .append_pair("fields", "id,text,timestamp,from,replies{from}")
            .append_pair("order", "reverse_chronological")
            .append_pair("limit", "50")
            .append_pair("access_token", access_token);

        let mut next_url: Option<String> = Some(first.to_string());

        while let Some(u) = next_url {
            if results.len() >= max {
                break;
            }
            let response = self.http.get(&u).send().await?;
            let page: PagedData<InstagramComment> = handle_response(response).await?;

            // Newest-first, so once the last item on a page predates the
            // window there is nothing older worth fetching. An
            // unparsable/absent timestamp is treated as "not old enough to
            // stop on" — matches Node's `Date.parse(...) < sinceMs` being
            // `false` for `NaN`.
            let stop = page
                .data
                .last()
                .and_then(|c| parse_iso_ms(&c.timestamp))
                .map(|ms| ms < since_ms)
                .unwrap_or(false);

            results.extend(page.data);
            if stop {
                break;
            }
            next_url = page.paging.and_then(|p| p.next);
        }

        // Present-but-garbage timestamps are excluded, matching Node's
        // `Date.parse(c.timestamp) >= sinceMs` (NaN comparisons are false).
        results.retain(|c| parse_iso_ms(&c.timestamp).map(|ms| ms >= since_ms).unwrap_or(false));
        results.truncate(max);
        Ok(results)
    }

    /// List the account's DM conversations, newest first, each with its
    /// participants and a one-message preview. `ig_user_id` is the account's
    /// professional user_id (the same id used to send messages and as
    /// webhook `entry.id`).
    pub async fn get_conversations(
        &self,
        access_token: &str,
        ig_user_id: &str,
    ) -> Result<Vec<InstagramConversation>, MetaApiError> {
        let mut url = url::Url::parse(&format!(
            "{}/{}/conversations",
            self.instagram_graph_base(),
            ig_user_id
        ))
        .expect("valid url");
        url.query_pairs_mut()
            .append_pair("platform", "instagram")
            .append_pair(
                "fields",
                "participants,updated_time,messages.limit(1){message,from,created_time}",
            )
            .append_pair("limit", "50")
            .append_pair("access_token", access_token);

        let response = self.http.get(url).send().await?;
        let page: DataPage<InstagramConversation> = handle_response(response).await?;
        Ok(page.data)
    }

    /// The messages in a conversation, with content. Meta only returns full
    /// details for the 20 most recent messages, newest first.
    pub async fn get_conversation_messages(
        &self,
        access_token: &str,
        conversation_id: &str,
    ) -> Result<Vec<InstagramMessage>, MetaApiError> {
        let mut url = url::Url::parse(&format!("{}/{}", self.instagram_graph_base(), conversation_id))
            .expect("valid url");
        url.query_pairs_mut()
            .append_pair("fields", "messages{id,created_time,from,to,message}")
            .append_pair("access_token", access_token);

        let response = self.http.get(url).send().await?;
        let page: ConversationMessagesResponse = handle_response(response).await?;
        Ok(page.messages.map(|m| m.data).unwrap_or_default())
    }

    pub async fn get_user_info(&self, access_token: &str) -> Result<InstagramUser, MetaApiError> {
        let mut url = url::Url::parse(&format!("{}/me", self.instagram_graph_base())).expect("valid url");
        url.query_pairs_mut()
            .append_pair("fields", "id,user_id,username,name,profile_picture_url,followers_count")
            .append_pair("access_token", access_token);

        let response = self.http.get(url).send().await?;
        handle_response(response).await
    }

    pub async fn get_user_media(&self, access_token: &str, limit: u32) -> Result<Vec<InstagramMedia>, MetaApiError> {
        let mut url = url::Url::parse(&format!("{}/me/media", self.instagram_graph_base())).expect("valid url");
        url.query_pairs_mut()
            .append_pair("fields", MEDIA_FIELDS)
            .append_pair("limit", &limit.to_string())
            .append_pair("access_token", access_token);

        let response = self.http.get(url).send().await?;
        let page: DataPage<InstagramMedia> = handle_response(response).await?;
        Ok(page.data)
    }

    /// Fetch media by following pagination cursors until `max` items are
    /// collected or there are no more pages. Pass a large `max` for an "all
    /// time" view; the cap is a safety ceiling so an account with thousands
    /// of posts can't spin forever (and so downstream per-media insight
    /// calls stay bounded).
    pub async fn get_all_user_media(&self, access_token: &str, max: usize) -> Result<Vec<InstagramMedia>, MetaApiError> {
        let mut results: Vec<InstagramMedia> = Vec::new();
        let page_size = MEDIA_PAGE_SIZE.min(max.max(1));

        let mut first = url::Url::parse(&format!("{}/me/media", self.instagram_graph_base())).expect("valid url");
        first
            .query_pairs_mut()
            .append_pair("fields", MEDIA_FIELDS)
            .append_pair("limit", &page_size.to_string())
            .append_pair("access_token", access_token);

        let mut next_url: Option<String> = Some(first.to_string());

        while let Some(u) = next_url {
            if results.len() >= max {
                break;
            }
            let response = self.http.get(&u).send().await?;
            let page: PagedData<InstagramMedia> = handle_response(response).await?;
            results.extend(page.data);
            next_url = page.paging.and_then(|p| p.next);
        }

        results.truncate(max);
        Ok(results)
    }

    /// Fetch per-media insight metrics (views, reach, saved, shares, etc.).
    ///
    /// Requires the `instagram_business_manage_insights` permission —
    /// accounts connected before that scope was requested will error with
    /// `MetaApiError::Permission`. Metric validity varies by media type, so
    /// pass only metrics that apply to the given media (e.g. `views` is not
    /// valid for image posts on some accounts).
    pub async fn get_media_insights(
        &self,
        access_token: &str,
        media_id: &str,
        metrics: &[&str],
    ) -> Result<InstagramMediaInsights, MetaApiError> {
        let mut url = url::Url::parse(&format!("{}/{}/insights", self.instagram_graph_base(), media_id))
            .expect("valid url");
        url.query_pairs_mut()
            .append_pair("metric", &metrics.join(","))
            .append_pair("access_token", access_token);

        let response = self.http.get(url).send().await?;
        let page: DataPage<InsightMetric> = handle_response(response).await?;

        let mut result = InstagramMediaInsights::default();
        for entry in page.data {
            let value = entry.values.first().map(|v| v.value).unwrap_or(0);
            match entry.name.as_str() {
                "views" => result.views = Some(value),
                "reach" => result.reach = Some(value),
                "likes" => result.likes = Some(value),
                "comments" => result.comments = Some(value),
                "saved" => result.saved = Some(value),
                "shares" => result.shares = Some(value),
                "total_interactions" => result.total_interactions = Some(value),
                _ => {}
            }
        }
        Ok(result)
    }

    /// Fetch the daily net follower change for an account.
    ///
    /// Requires `instagram_business_manage_insights`. This metric is *not*
    /// universally available: Instagram omits it for accounts under 100
    /// followers and it is unsupported on some account types. Callers must
    /// treat `Ok(None)` as "no series available" rather than an error — see
    /// the backfill in `lib/reports/follower-history.ts`.
    ///
    /// Returns daily deltas, not running totals. Reconstruct absolute counts
    /// by anchoring on a known `followers_count` and walking backwards.
    pub async fn get_follower_count_series(
        &self,
        access_token: &str,
        instagram_account_id: &str,
        days: i64,
    ) -> Result<Option<Vec<FollowerCountPoint>>, MetaApiError> {
        let span = days.clamp(1, FOLLOWER_INSIGHT_MAX_DAYS);
        let until = chrono::Utc::now().timestamp();
        let since = until - (span - 1) * 86_400;

        let mut url = url::Url::parse(&format!(
            "{}/{}/insights",
            self.instagram_graph_base(),
            instagram_account_id
        ))
        .expect("valid url");
        url.query_pairs_mut()
            .append_pair("metric", "follower_count")
            .append_pair("period", "day")
            .append_pair("since", &since.to_string())
            .append_pair("until", &until.to_string())
            .append_pair("access_token", access_token);

        let response = match self.http.get(url).send().await {
            Ok(r) => r,
            Err(e) => {
                // A missing permission is a real signal the caller may want
                // to surface; anything else here means the metric is simply
                // unavailable for this account, which is not worth failing
                // the whole dashboard over.
                eprintln!("[Instagram] follower_count insights unavailable: {e}");
                return Ok(None);
            }
        };

        let page = match handle_response::<DataPage<FollowerInsightMetric>>(response).await {
            Ok(p) => p,
            Err(err @ MetaApiError::Permission { .. }) => return Err(err),
            Err(e) => {
                eprintln!("[Instagram] follower_count insights unavailable: {e}");
                return Ok(None);
            }
        };

        let metric = page.data.into_iter().find(|d| d.name == "follower_count");
        let metric = match metric {
            Some(m) if !m.values.is_empty() => m,
            _ => return Ok(None),
        };

        let points = metric
            .values
            .into_iter()
            .map(|v| FollowerCountPoint {
                date: take_first_10_chars(&v.end_time.unwrap_or_else(|| chrono::Utc::now().to_rfc3339())),
                delta: v.value,
            })
            .collect();

        Ok(Some(points))
    }

    pub async fn get_long_lived_token(&self, short_lived_token: &str) -> Result<TokenResult, MetaApiError> {
        let mut url = url::Url::parse(&format!("{}/access_token", self.instagram_graph_base())).expect("valid url");
        url.query_pairs_mut()
            .append_pair("grant_type", "ig_exchange_token")
            .append_pair("client_secret", &self.instagram_app_secret)
            .append_pair("access_token", short_lived_token);

        let response = self.http.get(url).send().await?;
        let data: TokenResponse = handle_response(response).await?;
        Ok(TokenResult {
            access_token: data.access_token,
            expires_in: data.expires_in.unwrap_or(5_184_000),
        })
    }

    pub async fn refresh_long_lived_token(&self, long_lived_token: &str) -> Result<TokenResult, MetaApiError> {
        let mut url = url::Url::parse(&format!("{}/refresh_access_token", self.instagram_graph_base()))
            .expect("valid url");
        url.query_pairs_mut()
            .append_pair("grant_type", "ig_refresh_token")
            .append_pair("access_token", long_lived_token);

        let response = self.http.get(url).send().await?;
        let data: TokenResponse = handle_response(response).await?;
        Ok(TokenResult {
            access_token: data.access_token,
            expires_in: data.expires_in.unwrap_or(5_184_000),
        })
    }

    pub async fn subscribe_instagram_account_to_webhooks(
        &self,
        instagram_account_id: &str,
        access_token: &str,
    ) -> Result<SubscribeResult, MetaApiError> {
        let url = format!(
            "{}/{}/subscribed_apps",
            self.instagram_graph_base(),
            instagram_account_id
        );
        let body = serde_json::json!({ "subscribed_fields": ["comments", "messages"] });
        let response = self
            .http
            .post(url)
            .bearer_auth(access_token)
            .json(&body)
            .send()
            .await?;
        handle_response(response).await
    }

    pub async fn debug_token(&self, input_token: &str, access_token: &str) -> Result<serde_json::Value, MetaApiError> {
        let mut url = url::Url::parse(&format!("{}/debug_token", self.facebook_graph_base())).expect("valid url");
        url.query_pairs_mut()
            .append_pair("input_token", input_token)
            .append_pair("access_token", access_token);

        let response = self.http.get(url).send().await?;
        handle_response(response).await
    }
}

// --- Types -----------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct SendMessageResult {
    pub recipient_id: String,
    pub message_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CommentReplyResult {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SubscribeResult {
    pub success: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstagramUser {
    pub id: String,
    /// Instagram professional account ID. This — not `id` (the app-scoped
    /// ID) — is what appears as `entry.id` in webhooks and is used by the
    /// messaging API.
    #[serde(default)]
    pub user_id: Option<String>,
    pub username: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub profile_picture_url: Option<String>,
    /// Current follower total. Point-in-time only — Instagram exposes no
    /// history for this field, so long-run trends come from
    /// `FollowerSnapshot` instead.
    #[serde(default)]
    pub followers_count: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstagramComment {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub from: Option<InstagramCommentAuthor>,
    pub timestamp: String,
    /// Present when the comments query asks for `replies{from}`. Used to
    /// tell whether the account owner has already replied to this comment.
    #[serde(default)]
    pub replies: Option<InstagramCommentReplies>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstagramCommentAuthor {
    pub id: String,
    #[serde(default)]
    pub username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstagramCommentReplies {
    #[serde(default)]
    pub data: Option<Vec<InstagramCommentReply>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstagramCommentReply {
    pub id: String,
    #[serde(default)]
    pub from: Option<InstagramCommentAuthor>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstagramMedia {
    pub id: String,
    #[serde(default)]
    pub caption: Option<String>,
    pub media_type: String,
    #[serde(default)]
    pub media_product_type: Option<String>,
    #[serde(default)]
    pub media_url: Option<String>,
    #[serde(default)]
    pub thumbnail_url: Option<String>,
    pub timestamp: String,
    #[serde(default)]
    pub permalink: Option<String>,
    #[serde(default)]
    pub like_count: Option<i64>,
    #[serde(default)]
    pub comments_count: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct InstagramMediaInsights {
    pub views: Option<i64>,
    pub reach: Option<i64>,
    pub likes: Option<i64>,
    pub comments: Option<i64>,
    pub saved: Option<i64>,
    pub shares: Option<i64>,
    pub total_interactions: Option<i64>,
}

/// One day of net follower change, as reported by account insights.
#[derive(Debug, Clone, Serialize)]
pub struct FollowerCountPoint {
    /// ISO date (YYYY-MM-DD) the change is attributed to.
    pub date: String,
    /// Net followers gained (or lost, if negative) that day.
    pub delta: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstagramParticipant {
    pub id: String,
    #[serde(default)]
    pub username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstagramMessage {
    pub id: String,
    #[serde(default)]
    pub created_time: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub from: Option<InstagramParticipant>,
    #[serde(default)]
    pub to: Option<DataList<InstagramParticipant>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstagramConversation {
    pub id: String,
    #[serde(default)]
    pub updated_time: Option<String>,
    #[serde(default)]
    pub participants: Option<DataList<InstagramParticipant>>,
    #[serde(default)]
    pub messages: Option<DataList<InstagramMessage>>,
}

/// A tappable web_url button in a DM button template. Instagram's button
/// template supports up to 3 buttons; titles are capped at 20 chars by Meta.
pub struct LinkButton {
    pub title: String,
    pub url: String,
}

pub struct TokenResult {
    pub access_token: String,
    pub expires_in: i64,
}

// --- Wire-format helpers (private) -----------------------------------------

#[derive(Debug, Deserialize)]
struct DataPage<T> {
    #[serde(default = "Vec::new")]
    data: Vec<T>,
}

#[derive(Debug, Deserialize)]
struct PagedData<T> {
    #[serde(default = "Vec::new")]
    data: Vec<T>,
    #[serde(default)]
    paging: Option<Paging>,
}

#[derive(Debug, Deserialize)]
struct Paging {
    #[serde(default)]
    next: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DataList<T> {
    #[serde(default = "Vec::new")]
    pub data: Vec<T>,
}

#[derive(Debug, Deserialize)]
struct ConversationMessagesResponse {
    #[serde(default)]
    messages: Option<DataList<InstagramMessage>>,
}

#[derive(Debug, Deserialize)]
struct InsightMetric {
    name: String,
    #[serde(default = "Vec::new")]
    values: Vec<InsightValue>,
}

#[derive(Debug, Deserialize)]
struct InsightValue {
    #[serde(default)]
    value: i64,
}

#[derive(Debug, Deserialize)]
struct FollowerInsightMetric {
    name: String,
    #[serde(default = "Vec::new")]
    values: Vec<FollowerInsightValue>,
}

#[derive(Debug, Deserialize)]
struct FollowerInsightValue {
    #[serde(default)]
    value: i64,
    #[serde(default)]
    end_time: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    expires_in: Option<i64>,
}

fn truncate_chars(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

fn take_first_10_chars(s: &str) -> String {
    s.chars().take(10).collect()
}

fn to_web_url_buttons(buttons: &[LinkButton]) -> Vec<serde_json::Value> {
    buttons
        .iter()
        .take(3)
        .map(|b| {
            serde_json::json!({
                "type": "web_url",
                "url": b.url,
                "title": truncate_chars(&b.title, 20),
            })
        })
        .collect()
}

/// Parses a Graph API timestamp (`2024-06-01T10:15:30+0000`, non-colon
/// numeric offset) to epoch milliseconds. Returns `None` on anything
/// unparsable, mirroring `Date.parse`'s `NaN` for garbage input.
fn parse_iso_ms(ts: &str) -> Option<i64> {
    chrono::DateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S%z")
        .ok()
        .map(|dt| dt.timestamp_millis())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_chars_caps_at_char_boundary() {
        assert_eq!(truncate_chars("hello world", 5), "hello");
        assert_eq!(truncate_chars("hi", 20), "hi");
    }

    #[test]
    fn to_web_url_buttons_caps_at_three_and_truncates_titles() {
        let buttons = vec![
            LinkButton { title: "a".repeat(30), url: "https://a.example".into() },
            LinkButton { title: "b".into(), url: "https://b.example".into() },
            LinkButton { title: "c".into(), url: "https://c.example".into() },
            LinkButton { title: "d".into(), url: "https://d.example".into() },
        ];
        let out = to_web_url_buttons(&buttons);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0]["title"].as_str().unwrap().len(), 20);
        assert_eq!(out[0]["type"], "web_url");
    }

    #[test]
    fn parse_iso_ms_handles_graph_api_offset_format() {
        let ms = parse_iso_ms("2024-06-01T10:15:30+0000").unwrap();
        assert_eq!(ms, 1717236930000);
    }

    #[test]
    fn parse_iso_ms_returns_none_for_garbage() {
        assert!(parse_iso_ms("not-a-date").is_none());
    }
}
