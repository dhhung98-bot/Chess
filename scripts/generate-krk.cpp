// Retrograde analysis of king-and-rook versus king, ignoring repetition
// and the fifty-move clock. A captured rook is a draw.
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <vector>

constexpr int Size = 64 * 64 * 64 * 2;
constexpr uint8_t Draw = 255;
constexpr std::array<int, 4> DX{1, -1, 0, 0};
constexpr std::array<int, 4> DY{0, 0, 1, -1};

int encode(int wk, int wr, int bk, int turn) { return ((wk * 64 + wr) * 64 + bk) * 2 + turn; }
int x(int n) { return n % 8; }
int y(int n) { return n / 8; }
bool inside(int col, int row) { return col >= 0 && col < 8 && row >= 0 && row < 8; }
bool adjacent(int a, int b) { return std::max(std::abs(x(a) - x(b)), std::abs(y(a) - y(b))) <= 1; }
bool between(int n, int a, int b) { return std::min(a, b) < n && n < std::max(a, b); }

bool check(int wk, int wr, int bk) {
    return (x(wr) == x(bk) && !(x(wk) == x(wr) && between(y(wk), y(wr), y(bk))))
        || (y(wr) == y(bk) && !(y(wk) == y(wr) && between(x(wk), x(wr), x(bk))));
}

bool valid(int wk, int wr, int bk) { return wk != wr && wr != bk && !adjacent(wk, bk); }

template <class F> void neighbors(int square, F visit) {
    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && inside(x(square) + dx, y(square) + dy)) {
            visit(square + dx + 8 * dy);
        }
    }
}

int main() {
    std::vector<uint8_t> distance(Size, Draw), remaining(Size);
    std::vector<int> queue;
    for (int wk = 0; wk < 64; wk++) for (int wr = 0; wr < 64; wr++) for (int bk = 0; bk < 64; bk++) {
        if (!valid(wk, wr, bk)) continue;
        const int state = encode(wk, wr, bk, 1);
        neighbors(bk, [&](int next) {
            if (!adjacent(wk, next) && (next == wr || !check(wk, wr, next))) remaining[state]++;
        });
        if (remaining[state] == 0 && check(wk, wr, bk)) {
            distance[state] = 0;
            queue.push_back(state);
        }
    }

    for (size_t head = 0; head < queue.size(); head++) {
        const int state = queue[head];
        const int turn = state % 2, bk = state / 2 % 64, wr = state / 128 % 64, wk = state / 8192;
        const auto mark = [&](int previous) {
            distance[previous] = distance[state] + 1;
            queue.push_back(previous);
        };
        if (turn == 0) {
            neighbors(bk, [&](int prevKing) {
                if (!valid(wk, wr, prevKing)) return;
                const int previous = encode(wk, wr, prevKing, 1);
                if (distance[previous] == Draw && --remaining[previous] == 0) mark(previous);
            });
            continue;
        }
        const auto visitWhite = [&](int prevKing, int prevRook) {
            if (!valid(prevKing, prevRook, bk) || check(prevKing, prevRook, bk)) return;
            const int previous = encode(prevKing, prevRook, bk, 0);
            if (distance[previous] == Draw) mark(previous);
        };
        neighbors(wk, [&](int prevKing) { visitWhite(prevKing, wr); });
        for (int direction = 0; direction < 4; direction++) {
            int col = x(wr) + DX[direction], row = y(wr) + DY[direction];
            while (inside(col, row)) {
                const int prevRook = col + 8 * row;
                if (prevRook == wk || prevRook == bk) break;
                visitWhite(wk, prevRook);
                col += DX[direction];
                row += DY[direction];
            }
        }
    }
    std::cout.write(reinterpret_cast<const char*>(distance.data()), distance.size());
}
