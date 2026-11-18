//! Largest-Triangle-Three-Buckets (LTTB) downsampling algorithm.
//! Used per plan.md section 10 item 5 to downsample telemetry history series
//! to <= 300 points on connect, preventing history streaming bottlenecks.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DataPoint {
    pub timestamp: u64,
    pub value: f64,
}

impl DataPoint {
    pub fn new(timestamp: u64, value: f64) -> Self {
        Self { timestamp, value }
    }
}

/// Downsamples a slice of `(timestamp, value)` points to `threshold` points using LTTB.
/// If `data.len() <= threshold` or `threshold <= 2`, returns the original data (or endpoints).
pub fn lttb_downsample(data: &[DataPoint], threshold: usize) -> Vec<DataPoint> {
    let n = data.len();
    if threshold >= n || threshold <= 2 {
        return data.to_vec();
    }

    let mut sampled = Vec::with_capacity(threshold);

    // Bucket size. Leave room for start and end data points
    let every = (n - 2) as f64 / (threshold - 2) as f64;

    // First point is always selected
    let mut a = 0;
    sampled.push(data[a]);

    for i in 0..(threshold - 2) {
        // Calculate point average for next bucket (bucket c)
        let avg_range_start = (((i + 1) as f64 * every).floor() as usize + 1).min(n - 1);
        let avg_range_end = (((i + 2) as f64 * every).floor() as usize + 1).min(n);

        let mut avg_x = 0.0;
        let mut avg_y = 0.0;
        let avg_range_len = (avg_range_end - avg_range_start).max(1) as f64;

        for idx in avg_range_start..avg_range_end {
            avg_x += data[idx].timestamp as f64;
            avg_y += data[idx].value;
        }
        avg_x /= avg_range_len;
        avg_y /= avg_range_len;

        // Current bucket range (bucket b)
        let range_offs = ((i as f64 * every).floor() as usize + 1).min(n - 1);
        let range_to = (((i + 1) as f64 * every).floor() as usize + 1).min(n);

        // Point a
        let point_a_x = data[a].timestamp as f64;
        let point_a_y = data[a].value;

        let mut max_area = -1.0;
        let mut max_area_point_idx = range_offs;

        for idx in range_offs..range_to {
            let point_b_x = data[idx].timestamp as f64;
            let point_b_y = data[idx].value;

            // Area of triangle formed by point a, point b, and bucket c average
            let area = ((point_a_x - avg_x) * (point_b_y - point_a_y)
                - (point_a_x - point_b_x) * (avg_y - point_a_y))
                .abs()
                * 0.5;

            if area > max_area {
                max_area = area;
                max_area_point_idx = idx;
            }
        }

        sampled.push(data[max_area_point_idx]);
        a = max_area_point_idx;
    }

    // Always add the last point
    sampled.push(data[n - 1]);

    sampled
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lttb_small_dataset() {
        let points = vec![
            DataPoint::new(1, 10.0),
            DataPoint::new(2, 20.0),
            DataPoint::new(3, 15.0),
        ];

        let result = lttb_downsample(&points, 5);
        assert_eq!(result.len(), 3);
    }

    #[test]
    fn test_lttb_downsampling_threshold() {
        let mut points = Vec::new();
        for i in 0..1000 {
            let val = ((i as f64) * 0.1).sin() * 50.0 + 50.0;
            points.push(DataPoint::new(i, val));
        }

        let threshold = 300;
        let sampled = lttb_downsample(&points, threshold);
        assert_eq!(sampled.len(), threshold);

        // Preserves first and last point
        assert_eq!(sampled.first().unwrap().timestamp, points.first().unwrap().timestamp);
        assert_eq!(sampled.last().unwrap().timestamp, points.last().unwrap().timestamp);
    }
}
