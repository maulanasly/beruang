//! Minimal TTL cache backing the dividend-yields fan-out (mirrors
//! `backend/services.py` `_ttl_cache(ttl_seconds=21600)`).

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug)]
pub struct TtlCache<T: Clone> {
    ttl: Duration,
    entries: Mutex<HashMap<String, (T, Instant)>>,
}

impl<T: Clone> TtlCache<T> {
    pub fn new(ttl: Duration) -> Self {
        Self {
            ttl,
            entries: Mutex::new(HashMap::new()),
        }
    }

    pub fn get(&self, key: &str) -> Option<T> {
        let entries = self.entries.lock().unwrap();
        match entries.get(key) {
            Some((value, at)) if at.elapsed() < self.ttl => Some(value.clone()),
            _ => None,
        }
    }

    pub fn put(&self, key: String, value: T) {
        self.entries
            .lock()
            .unwrap()
            .insert(key, (value, Instant::now()));
    }
}

#[cfg(test)]
mod tests {
    use super::TtlCache;
    use std::time::Duration;

    #[test]
    fn hit_before_expiry_miss_after() {
        let cache = TtlCache::new(Duration::from_millis(50));
        assert_eq!(cache.get("k"), None);
        cache.put("k".to_string(), 42);
        assert_eq!(cache.get("k"), Some(42));
        std::thread::sleep(Duration::from_millis(60));
        assert_eq!(cache.get("k"), None);
    }
}
