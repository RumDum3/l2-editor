use std::sync::Mutex;

pub struct RuntimeSlot<L> {
    inner: Mutex<Option<L>>,
}

impl<L> Default for RuntimeSlot<L> {
    fn default() -> Self {
        Self { inner: Mutex::new(None) }
    }
}

impl<L> RuntimeSlot<L> {
    pub fn replace(&self, loaded: L) {
        *self.inner.lock().unwrap() = Some(loaded);
    }

    pub fn is_loaded(&self) -> bool {
        self.inner.lock().unwrap().is_some()
    }

    pub fn with<R>(&self, f: impl FnOnce(&L) -> R) -> Option<R> {
        let g = self.inner.lock().unwrap();
        g.as_ref().map(f)
    }

    pub fn with_mut<R>(&self, f: impl FnOnce(&mut L) -> R) -> Option<R> {
        let mut g = self.inner.lock().unwrap();
        g.as_mut().map(f)
    }
}
