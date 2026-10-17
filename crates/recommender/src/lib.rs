//! Deterministic content-based scoring. No user profile leaves the browser.
//! Primitive arguments keep the WebAssembly ABI dependency-free.
pub fn match_score(features: [f64; 6], taste: [f64; 6], rating: f64, novelty_penalty: f64) -> f64 {
    if features
        .iter()
        .chain(taste.iter())
        .any(|x| !x.is_finite() || !(0.0..=1.0).contains(x))
        || !rating.is_finite()
        || !novelty_penalty.is_finite()
    {
        return 0.0;
    }
    let dot: f64 = features.iter().zip(taste).map(|(a, b)| a * b).sum();
    let a: f64 = features.iter().map(|v| v * v).sum();
    let b: f64 = taste.iter().map(|v| v * v).sum();
    let similarity = if a > 0.0 && b > 0.0 {
        dot / (a * b).sqrt()
    } else {
        0.0
    };
    let distance: f64 = features
        .iter()
        .zip(taste)
        .map(|(a, b)| (a - b).abs())
        .sum::<f64>()
        / 6.0;
    ((similarity * 0.65 + (1.0 - distance) * 0.25 + rating.clamp(0.0, 10.0) / 10.0 * 0.1) * 100.0
        - novelty_penalty.max(0.0))
    .clamp(0.0, 100.0)
}
#[unsafe(no_mangle)]
pub extern "C" fn score(
    f0: f64,
    f1: f64,
    f2: f64,
    f3: f64,
    f4: f64,
    f5: f64,
    t0: f64,
    t1: f64,
    t2: f64,
    t3: f64,
    t4: f64,
    t5: f64,
    rating: f64,
    novelty: f64,
) -> f64 {
    match_score(
        [f0, f1, f2, f3, f4, f5],
        [t0, t1, t2, t3, t4, t5],
        rating,
        novelty,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn perfect_match_scores_one_hundred() {
        assert!((match_score([1.; 6], [1.; 6], 10., 0.) - 100.).abs() < 1e-10);
    }
    #[test]
    fn affinity_changes_the_order() {
        let action = [0., 0., 1., 0., 0., 0.];
        let comfort = [0., 0., 0., 0., 1., 0.];
        assert!(match_score(action, action, 8., 0.) > match_score(comfort, action, 8., 0.));
    }
    #[test]
    fn empty_profile_is_finite() {
        assert!(match_score([0.; 6], [0.; 6], 0., 0.).is_finite());
    }
    #[test]
    fn invalid_numbers_are_rejected() {
        assert_eq!(match_score([f64::NAN; 6], [1.; 6], 10., 0.), 0.);
    }
    #[test]
    fn novelty_penalty_is_applied() {
        assert_eq!(match_score([1.; 6], [1.; 6], 10., 5.), 95.);
    }
}
