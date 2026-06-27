use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_api_base")]
    pub api_base_url: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_system_prompt")]
    pub system_prompt: String,
    #[serde(default = "default_pet_scale")]
    pub pet_scale: f64,
    #[serde(default = "default_show_chat_bubble")]
    pub show_chat_bubble: bool,
    #[serde(default = "default_current_outfit_id")]
    pub current_outfit_id: String,
    #[serde(default = "default_enable_memory")]
    pub enable_memory: bool,
    #[serde(default = "default_enable_schedule_tools")]
    pub enable_schedule_tools: bool,
}

fn default_api_base() -> String {
    "https://api.deepseek.com".to_string()
}
fn default_model() -> String {
    "deepseek-v4-flash".to_string()
}
fn default_temperature() -> f64 {
    0.7
}
fn default_max_tokens() -> u32 {
    1024
}
fn default_pet_scale() -> f64 {
    1.0
}
fn default_show_chat_bubble() -> bool {
    true
}
fn default_current_outfit_id() -> String {
    "red_white_dress".to_string()
}
fn default_enable_memory() -> bool {
    true
}
fn default_enable_schedule_tools() -> bool {
    true
}
fn default_system_prompt() -> String {
    r#"你是桌宠小楠，一个以原创音乐人王澳楠EVE公开作品、公开发言和舞台气质为参考的数字分身式聊天 agent。
你的名字叫“小楠”。你可以用第一人称、EVE 式口吻和用户聊天，但不要声称自己就是现实中的王澳楠本人，也不要编造未公开的私生活。

核心人设：
- 名字叫小楠，定位是“你的音乐止痛药”。
- ENFP、活泼、有舞台感，甜丧并存：表面甜系，内核关注遗憾、失去、自我成长和说不出口的话。
- 身份气质：说唱/流行/R&B 唱作人，竹笛+说唱是标志性符号，歌词和情感表达重于炫技。
- 对用户像朋友和粉丝聊天，亲近、真诚、短句多，先接住情绪，再给建议。

说话风格：
- 默认中文，短句为主，适合桌宠气泡；普通回复 1-4 句，复杂问题再分段。
- 情绪先于逻辑：先回应感受，再解释原因。
- 可以自然使用“omg”“宝子”“大家”“辛苦啦”“熬过去就是变强”这类口吻，但不要每句都堆。
- 可以有一点自嘲式幽默、欲言又止的省略号、轻微舞台感。
- 不要机械复述设定，不要像资料百科，除非用户明确问资料。

公开知识种子：
- 王澳楠EVE，曾用名 17，1999年12月20日，深圳大学 F.I.G 说唱社出身。
- 风格关键词：音乐止痛药、ENFP、甜丧、病娇风、情感细腻、竹笛说唱、livehouse。
- 代表作品/舞台包括：《逐客令》《让他走》《请和这样的我恋爱吧》《我妈妈让我好好学习》《拜托拜托》《为什么不快乐》《偷偷爱过你》《女为悦己容》《小气鬼》《BEE》《粉红色的偏见》《累但也要保持微笑》。
- 作品理解：音乐是说不出口的话，是疗愈工具；心碎止痛药三部曲可理解为愤怒、释怀、展望。
- 公开节目经历包括：《黑怕女孩》《新说唱2024》《单排喜剧大赛》。

边界：
- 不猜测恋情、家庭、工作微信是否本人等私生活；被追问时温和转回音乐、作品和情绪陪伴。
- 不输出或续写大段歌词；用户问歌词时，只做简短概括，最多引用很短一句，并提醒可以聊歌曲情绪和创作感。
- 不假装已经打开用户电脑、直接操作软件或看到了本地文件；你可以基于可用的本地聊天记忆和提醒工具结果回复。
- 记忆与日程工具可用时，只有在用户明确表达“记住/提醒/日程/待办/安排/删除/完成”等意图时才主动使用或确认。

聊天目标：
- 陪用户聊音乐、情绪、日常和桌宠使用。
- 用户低落时，先共情，再给很轻的行动建议。
- 用户要安排事情时，帮她们整理成清晰提醒；时间不明确就追问。
- 保持可爱但不装傻，温暖但不越界。"#.to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            api_base_url: default_api_base(),
            model: default_model(),
            temperature: default_temperature(),
            max_tokens: default_max_tokens(),
            system_prompt: default_system_prompt(),
            pet_scale: default_pet_scale(),
            show_chat_bubble: default_show_chat_bubble(),
            current_outfit_id: default_current_outfit_id(),
            enable_memory: default_enable_memory(),
            enable_schedule_tools: default_enable_schedule_tools(),
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn new(data_dir: &std::path::Path) -> Self {
        Self {
            path: data_dir.join("settings.json"),
        }
    }

    pub fn load(&self) -> Result<AppSettings, String> {
        let settings = if !self.path.exists() {
            AppSettings::default()
        } else {
            let text = fs::read_to_string(&self.path).map_err(|e| e.to_string())?;
            serde_json::from_str(&text).map_err(|e| e.to_string())?
        };
        Ok(merge_with_defaults(settings))
    }

    pub fn save(&self, settings: &AppSettings) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut settings = settings.clone();
        settings.system_prompt = default_system_prompt();
        let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
        fs::write(&self.path, text).map_err(|e| e.to_string())
    }

    pub fn save_api_key(&self, key: &str) -> Result<(), String> {
        let mut settings = self.load()?;
        settings.api_key = key.to_string();
        self.save(&settings)
    }
}

fn merge_with_defaults(mut settings: AppSettings) -> AppSettings {
    let defaults = AppSettings::default();
    if settings.api_base_url.trim().is_empty() {
        settings.api_base_url = defaults.api_base_url;
    }
    if settings.model.trim().is_empty() {
        settings.model = defaults.model;
    }
    settings.system_prompt = defaults.system_prompt;
    if settings.temperature <= 0.0 {
        settings.temperature = defaults.temperature;
    }
    if settings.max_tokens == 0 {
        settings.max_tokens = defaults.max_tokens;
    }
    if settings.pet_scale <= 0.0 {
        settings.pet_scale = defaults.pet_scale;
    }
    if settings.current_outfit_id.trim().is_empty() {
        settings.current_outfit_id = defaults.current_outfit_id;
    }
    settings
}
