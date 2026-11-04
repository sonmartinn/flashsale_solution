-- KEYS[1] = stock:<saleId>, KEYS[2] = buyers:<saleId>
-- ARGV[1] = userId, ARGV[2] = qty
-- Trả về: 1 thành công, 0 hết hàng, -1 đã mua, -2 chưa nạp kho
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return -1 end
local raw = redis.call('GET', KEYS[1])
if not raw then return -2 end
if tonumber(raw) < tonumber(ARGV[2]) then return 0 end
redis.call('DECRBY', KEYS[1], ARGV[2])
redis.call('SADD', KEYS[2], ARGV[1])
return 1
