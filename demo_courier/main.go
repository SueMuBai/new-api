package main

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

const TotalPackages = 100

func main() {
	var courierCount int
	fmt.Print("请输入快递员人数: ")
	_, err := fmt.Scanf("%d", &courierCount)
	if err != nil || courierCount <= 0 {
		courierCount = 5
		fmt.Printf("使用默认值: %d 个快递员\n", courierCount)
	}

	// ========== 方案1: Mutex + 共享计数器 ==========
	fmt.Println("\n========== 方案1: Mutex 互斥锁 ==========")
	deliverWithMutex(courierCount)

	// ========== 方案2: atomic 原子操作 ==========
	fmt.Println("\n========== 方案2: atomic 原子操作 ==========")
	deliverWithAtomic(courierCount)

	// ========== 方案3: channel（Go 推荐风格） ==========
	fmt.Println("\n========== 方案3: channel 通信 ==========")
	deliverWithChannel(courierCount)
}

// 方案1：Mutex 互斥锁 — 和 Java 的 synchronized 最类似
func deliverWithMutex(courierCount int) {
	var (
		remaining int            = TotalPackages // 剩余快递数
		mu        sync.Mutex                     // 互斥锁
		wg        sync.WaitGroup                 // 等待所有快递员完成
	)

	for i := range courierCount {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for {
				mu.Lock()
				if remaining <= 0 {
					mu.Unlock()
					break
				}
				packNo := remaining
				remaining--
				mu.Unlock()

				time.Sleep(time.Millisecond * time.Duration(50+id*10))
				fmt.Printf("快递员%d 派送了第 %d 号快递\n", id, packNo)
			}
			fmt.Printf("快递员%d 派送完毕\n", id)
		}(i)
	}
	wg.Wait()
	fmt.Printf("全部派送完成！共派送 %d 件\n", TotalPackages)
}

// 方案2：atomic 原子操作 — 性能更高
func deliverWithAtomic(courierCount int) {
	var remaining atomic.Int64
	remaining.Store(TotalPackages)
	var wg sync.WaitGroup

	for i := range courierCount {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for {
				current := remaining.Add(-1)
				if current < 0 {
					remaining.Add(1)
					break
				}
				packNo := current + 1
				time.Sleep(time.Millisecond * time.Duration(50+id*10))
				fmt.Printf("[atomic] 快递员%d 派送了第 %d 号快递\n", id, packNo)
			}
			fmt.Printf("[atomic] 快递员%d 派送完毕\n", id)
		}(i)
	}
	wg.Wait()
	fmt.Printf("[atomic] 全部派送完成！共派送 %d 件\n", TotalPackages)
}

// 方案3：channel — 不要通过共享内存来通信，而要通过通信来共享内存
func deliverWithChannel(courierCount int) {
	packages := make(chan int, TotalPackages)
	var wg sync.WaitGroup

	for i := range TotalPackages {
		packages <- i + 1
	}
	close(packages)

	for i := range courierCount {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for packNo := range packages {
				time.Sleep(time.Millisecond * time.Duration(50+id*10))
				fmt.Printf("[channel] 快递员%d 派送了第 %d 号快递\n", id, packNo)
			}
			fmt.Printf("[channel] 快递员%d 派送完毕\n", id)
		}(i)
	}
	wg.Wait()
	fmt.Printf("[channel] 全部派送完成！共派送 %d 件\n", TotalPackages)
}
